#!/usr/bin/env python3
"""Testes reais do Tauri/WebKitGTK. Usa uma biblioteca e arquivos isolados."""
import argparse
import base64
import json
import http.client
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import urllib.error


def wait(check, description, timeout=15):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            result = check()
            if result:
                return result
        except Exception as error:
            last = error
        time.sleep(0.08)
    raise AssertionError(f'Tempo excedido: {description}; último erro: {last}')


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class Desktop:
    def __init__(self, url, application):
        self.url, self.application, self.session = url, application, None

    def request(self, path, value=None, method=None):
        data = None if value is None else json.dumps(value).encode()
        request = urllib.request.Request(self.url + path, data, {'Content-Type': 'application/json'}, method=method)
        # O proxy do tauri-driver pode reutilizar uma conexão já encerrada pelo
        # WebKitWebDriver. Repetimos apenas leituras; cliques nunca são repetidos.
        read_only = path.endswith('/element') or (value is None and method != 'DELETE')
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=35) as response:
                    return json.load(response)['value']
            except urllib.error.HTTPError as error:
                raise RuntimeError(error.read().decode()) from error
            except (http.client.RemoteDisconnected, ConnectionResetError):
                if not read_only or attempt == 2:
                    raise
                time.sleep(.1)

    def start(self, choose_theme=True):
        result = self.request('/session', {'capabilities': {'alwaysMatch': {'tauri:options': {'application': str(self.application)}}}})
        self.session = result['sessionId']
        self.call('/timeouts', {'implicit': 3000})
        wait(lambda: self.js('return !!document.querySelector(".tiptap")?.editor'), 'editor inicial')
        library = wait(lambda: self.ipc('load_library'), 'SQLite')
        stored_theme = library['preferences'].get('theme', 'light')
        wait(lambda: self.js('return document.documentElement.dataset.theme') == stored_theme, 'aplicar preferências carregadas')
        needs_choice = not library['preferences'].get('themeChosen', stored_theme in ('light', 'dark', 'sepia') and 'theme' in library['preferences'])
        if needs_choice:
            wait(lambda: self.js('return !!document.querySelector(".welcome-modal")'), 'pergunta inicial de tema')
            if choose_theme:
                self.click('[aria-label="Usar tema Claro"]')
                wait(lambda: self.ipc('load_library')['preferences'].get('themeChosen'), 'guardar escolha de tema')

    def call(self, path, value=None, method=None):
        return self.request('/session/' + self.session + path, value, method)

    def js(self, script, *args):
        return self.call('/execute/sync', {'script': script, 'args': list(args)})

    def ipc(self, command, **args):
        result = self.call('/execute/async', {'script': 'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(done).catch(e=>done({__error:e}));', 'args': [command, args]})
        if isinstance(result, dict) and '__error' in result:
            raise RuntimeError(result['__error'])
        return result

    def element(self, css):
        return self.call('/element', {'using': 'css selector', 'value': css})['element-6066-11e4-a52e-4f735466cecf']

    def click(self, css):
        self.call('/element/' + self.element(css) + '/click', {})

    def choose(self, label, value):
        self.click(f'[role="combobox"][aria-label="{label}"]')
        wait(lambda: self.js('return !!document.querySelector(".select-options")'), 'abrir menu ' + label)
        assert self.js('const r=document.querySelector(".select-options").getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight'), 'Menu fora dos limites da janela.'
        self.click(f'.select-options [role="option"][data-value="{value}"]')
        wait(lambda: self.js('return !document.querySelector(".select-options")'), 'confirmar seleção ' + label)
        self.paint()

    def keys(self, css, text):
        self.call('/element/' + self.element(css) + '/value', {'text': text})

    def key(self, key, ctrl=False, shift=False):
        self.js('window.dispatchEvent(new KeyboardEvent("keydown",{key:arguments[0],ctrlKey:arguments[1],shiftKey:arguments[2],bubbles:true,cancelable:true}))', key, ctrl, shift)

    def editor(self, expression, *args):
        return self.js('const editor=document.querySelector(".editor-scroll:not(.inactive) .tiptap").editor;' + expression, *args)

    def reveal(self):
        self.key('Escape')
        wait(lambda: self.js('return getComputedStyle(document.querySelector(".titlebar")).opacity==="1"'), 'revelar interface')

    def paint(self):
        # TipTap restaura o foco em requestAnimationFrame; aguarda também a
        # pintura antes de iniciar a próxima interação ou capturar a janela.
        self.call('/execute/async', {'script': 'const done=arguments[arguments.length-1];requestAnimationFrame(()=>requestAnimationFrame(()=>done(true)));', 'args': []})

    def screenshot(self, path):
        self.paint()
        path.write_bytes(base64.b64decode(self.call('/screenshot')))

    def hover(self, css):
        element = self.element(css)
        self.call('/actions', {'actions': [{'type': 'pointer', 'id': 'mouse', 'parameters': {'pointerType': 'mouse'}, 'actions': [{'type': 'pointerMove', 'duration': 50, 'origin': 'viewport', 'x': 10, 'y': 10}, {'type': 'pointerMove', 'duration': 100, 'origin': {'element-6066-11e4-a52e-4f735466cecf': element}, 'x': 0, 'y': 0}]}]})

    def stop(self):
        if self.session:
            try:
                self.call('', method='DELETE')
            except Exception:
                pass
            self.session = None


def native_chooser(data_home, filename=None):
    # AT-SPI atua apenas na instância de teste; nunca em outra janela do usuário.
    import gi
    gi.require_version('Atspi', '2.0')
    from gi.repository import Atspi

    def walk(node):
        yield node
        for index in range(max(0, node.get_child_count())):
            yield from walk(node.get_child_at_index(index))

    def find_dialog():
        root = Atspi.get_desktop(0)
        for index in range(root.get_child_count()):
            app = root.get_child_at_index(index)
            if app.get_name() != 'entrelinhas':
                continue
            try:
                environment = Path(f'/proc/{app.get_process_id()}/environ').read_bytes()
            except OSError:
                continue
            if f'XDG_DATA_HOME={data_home}'.encode() not in environment.split(b'\0'):
                continue
            for child in range(app.get_child_count()):
                dialog = app.get_child_at_index(child)
                if dialog.get_role_name() == 'file chooser' and dialog.get_state_set().contains(Atspi.StateType.SHOWING):
                    return dialog
        return None

    dialog = wait(find_dialog, 'seletor nativo do GNOME')
    if filename:
        entry = next(node for node in walk(dialog) if node.get_role_name() == 'text' and node.get_state_set().contains(Atspi.StateType.SHOWING))
        assert Atspi.EditableText.set_text_contents(entry, str(filename))
    labels = ('Save', 'Salvar') if filename else ('Cancel', 'Cancelar')
    button = next(node for node in walk(dialog) if node.get_role_name() == 'button' and node.get_name() in labels)
    assert Atspi.Action.do_action(button, 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', default='src-tauri/target/debug/entrelinhas')
    parser.add_argument('--screenshots', default='artifacts/screenshots')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = (root / args.screenshots).resolve()
    output.mkdir(parents=True, exist_ok=True)
    driver = shutil.which('tauri-driver') or str(Path.home() / '.cargo/bin/tauri-driver')
    native_driver = os.environ.get('WEBKIT_WEBDRIVER') or shutil.which('WebKitWebDriver')
    if not native_driver:
        raise SystemExit('Instale webkitgtk-webdriver ou defina WEBKIT_WEBDRIVER.')
    with tempfile.TemporaryDirectory(prefix='entrelinhas-e2e-') as temporary:
        directory = Path(temporary)
        data_home = directory / 'xdg'
        downloads = directory / 'Downloads'
        downloads.mkdir()
        port, native_port = free_port(), free_port()
        environment = {**os.environ, 'XDG_DATA_HOME': str(data_home), 'XDG_CONFIG_HOME': str(directory / 'config')}
        log = (output.parent / 'desktop-driver.log').open('w')
        process = subprocess.Popen([driver, '--port', str(port), '--native-port', str(native_port), '--native-driver', native_driver], env=environment, stdout=log, stderr=log)
        app = Desktop(f'http://127.0.0.1:{port}', (root / args.binary).resolve())
        results = []
        def passed(name):
            results.append(name)
            print('OK · ' + name, flush=True)
        try:
            wait(lambda: urllib.request.urlopen(f'http://127.0.0.1:{port}/status', timeout=1).status == 200, 'WebDriver')
            app.start(choose_theme=False)
            assert app.js('return document.querySelectorAll(".welcome-modal .theme-choice").length') == 3
            assert not app.ipc('load_library')['preferences'], 'O tema padrão não deve ser persistido antes da escolha.'
            app.screenshot(output / 'welcome.png')
            app.click('[aria-label="Usar tema Sépia Noturno"]')
            wait(lambda: app.ipc('load_library')['preferences'].get('themeChosen'), 'persistir escolha inicial')
            passed('primeira abertura pergunta o tema antes de persistir preferências')
            app.click('[aria-label="Fechar aplicativo"]')
            time.sleep(.3)
            app.stop()
            app.start()
            assert not app.js('return !!document.querySelector(".welcome-modal")')
            assert app.js('return document.documentElement.dataset.theme') == 'sepia'
            passed('tema inicial lembrado sem repetir a apresentação')
            assert app.editor('return editor.getText()') == ''
            assert app.js('return document.title') == 'Entrelinhas'
            assert app.js('return document.querySelector(".brand").children.length') == 1
            assert app.js('return document.querySelectorAll("[role=tab]").length') == 0
            assert not app.js('return !!document.querySelector(".document-caption")')
            assert app.js('const editor=document.querySelector(".tiptap").getBoundingClientRect(), bar=document.querySelector(".document-toolbar").getBoundingClientRect();return Math.abs(editor.top-bar.bottom-56)<1')
            app.screenshot(output / 'blank.png')
            passed('inicialização em nota vazia')
            app.call('/window/rect', {'width': 980, 'height': 660})
            wait(lambda: app.js('return [innerWidth,innerHeight]') == [980, 660], 'redimensionar antes de fechar')
            app.click('[aria-label="Fechar aplicativo"]')
            time.sleep(.3)
            app.stop()
            app.start()
            wait(lambda: app.js('return [innerWidth,innerHeight]') == [980, 660], 'restaurar tamanho após reabrir')
            app.click('[aria-label="Maximizar ou restaurar"]')
            wait(lambda: app.ipc('plugin:window|is_maximized', label='main'), 'maximizar antes de fechar')
            app.click('[aria-label="Fechar aplicativo"]')
            time.sleep(.3)
            app.stop()
            app.start()
            wait(lambda: app.ipc('plugin:window|is_maximized', label='main'), 'reabrir maximizado')
            app.click('[aria-label="Maximizar ou restaurar"]')
            wait(lambda: not app.ipc('plugin:window|is_maximized', label='main'), 'restaurar janela após reabrir')
            wait(lambda: app.js('return [innerWidth,innerHeight]') == [980, 660], 'preservar tamanho normal ao restaurar')
            passed('tamanho e maximização preservados após fechar e reabrir')
            app.call('/window/rect', {'width': 1180, 'height': 780})
            wait(lambda: app.js('return [innerWidth,innerHeight]') == [1180, 780], 'restaurar janela para o restante dos testes')
            original_rect = app.call('/window/rect')
            for width in (720, 1500):
                app.call('/window/rect', {'width': width, 'height': 780})
                wait(lambda: app.js('return innerWidth') == width, 'redimensionar janela')
                wait(lambda: app.js('const r=document.querySelector(".tiptap").getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<1'), 'centralizar após redimensionamento')
            app.call('/window/rect', original_rect)
            wait(lambda: app.js('return innerWidth') == original_rect['width'], 'restaurar tamanho da janela')
            wait(lambda: app.js('const r=document.querySelector(".tiptap").getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<1'), 'estabilizar coluna após restauração')
            app.call('/execute/async', {'script':'const done=arguments[arguments.length-1];requestAnimationFrame(()=>requestAnimationFrame(()=>done(true)));','args':[]})
            passed('coluna centralizada em janelas estreitas e largas')
            before = app.js('return document.querySelector(".tiptap").getBoundingClientRect().toJSON()')
            secret = 'Há um espaço de silêncio entre uma ideia e outra. 日本語'
            app.keys('.tiptap', secret)
            wait(lambda: app.js('return document.querySelector(".app").classList.contains("immersive")'), 'imersão automática')
            after = app.js('return document.querySelector(".tiptap").getBoundingClientRect().toJSON()')
            assert before['left'] == after['left'] and before['top'] == after['top']
            assert abs(after['left'] + after['width'] / 2 - app.js('return innerWidth / 2')) < 1, 'A coluna deve ficar no centro da janela inteira.'
            wait(lambda: app.js('return getComputedStyle(document.querySelector(".titlebar")).visibility==="hidden"'), 'ocultar controles')
            assert app.js('return !!document.querySelector(".block-caret")')
            app.screenshot(output / 'imersivo.png')
            app.editor('editor.commands.insertContent("k".repeat(1000));return true')
            assert app.js('const scroll=document.querySelector(".editor-scroll:not(.inactive)");return scroll.scrollWidth<=scroll.clientWidth+1'), 'Linhas longas não devem escapar da coluna.'
            app.reveal()
            passed('imersão, cursor em bloco, posição estável e Esc')
            app.click('[aria-label="Fechar aplicativo"]')
            time.sleep(.3)
            app.stop()
            app.start()
            assert app.editor('return editor.getText()') == ''
            for path in data_home.rglob('*'):
                if path.is_file():
                    assert secret.encode('utf-8') not in path.read_bytes(), str(path)
            passed('fechar e reabrir descarta rascunhos sem recuperação')
            app.click('[aria-label="Criar projeto"]')
            app.keys('.modal input[maxlength="120"]', 'Caderno de ideias')
            app.click('[aria-label="Cor do projeto"]')
            assert app.js('return document.querySelectorAll("[role=dialog]").length') == 2
            color_input = app.element('[aria-label="Cor em hexadecimal"]')
            app.call('/element/' + color_input + '/clear', {})
            app.keys('[aria-label="Cor em hexadecimal"]', '#b37a59')
            app.click('[role="dialog"][aria-label="Cor do projeto"] .primary')
            wait(lambda: app.js('return document.querySelectorAll("[role=dialog]").length') == 1, 'voltar ao formulário do projeto')
            assert not app.ipc('load_library')['projects'], 'A cor não deve submeter o formulário do projeto.'
            app.click('.modal button[type="submit"]')
            wait(lambda: len(app.ipc('load_library')['projects']) == 1, 'criar projeto')
            project_id = app.ipc('load_library')['projects'][0]['id']
            assert app.ipc('load_library')['projects'][0]['color'] == '#b37a59'
            app.click('[aria-label="Projeto do documento atual"]')
            app.screenshot(output / 'project-picker.png')
            app.click(f'[role="option"][data-project-id="{project_id}"]')
            wait(lambda: app.js('return document.querySelector(".project-assignment").innerText.includes("Caderno de ideias")'), 'selecionar projeto no painel do aplicativo')
            rich = '<h1>O que cabe entre as linhas</h1><p>Algumas ideias só precisam de um pouco de espaço para encontrar sua própria forma.</p><p>Escrever é também prestar atenção: ao que passou, ao que permanece e ao que ainda pode nascer.</p><blockquote><p>Deixe uma página aberta para o inesperado.</p></blockquote><h2>Um começo simples</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>Encontrar um lugar tranquilo</p></div></li><li data-type="taskItem" data-checked="false"><div><p>Dar tempo às ideias</p></div></li></ul>'
            app.editor('editor.commands.setContent(arguments[0]); return true', rich)
            app.key('s', ctrl=True)
            note_path = downloads / 'Entre as linhas.md'
            native_chooser(data_home, note_path)
            wait(note_path.exists, 'salvar documento no disco')
            wait(lambda: len(app.ipc('load_library')['documents']) == 1, 'registrar documento')
            library = app.ipc('load_library')
            assert library['documents'][0]['projectId'] == project_id
            assert library['documents'][0]['path'] == str(note_path)
            assert '# O que cabe entre as linhas' in note_path.read_text()
            passed('Ctrl+S e seletor GNOME gravam Markdown em Downloads e associam projeto')
            app.keys('.editor-scroll:not(.inactive) .tiptap', ' ALTERAÇÃO_NÃO_SALVA')
            wait(lambda: app.js('return !document.querySelector(".toast") || getComputedStyle(document.querySelector(".toast")).visibility==="hidden"'), 'ocultar avisos durante a digitação')
            assert 'ALTERAÇÃO_NÃO_SALVA' not in note_path.read_text()
            app.reveal()
            app.click('[aria-label="Fechar aplicativo"]')
            time.sleep(.3)
            app.stop()
            app.start()
            assert app.editor('return editor.getText()') == ''
            library = app.ipc('load_library')
            assert library['projects'][0]['id'] == project_id
            assert library['documents'][0]['path'] == str(note_path)
            if app.js('return document.querySelector(".project-toggle").getAttribute("aria-expanded")') == 'false':
                app.click('.project-toggle')
            app.click('.document-entry')
            wait(lambda: app.editor('return editor.getText().includes("O que cabe")'), 'reabrir Markdown')
            assert not app.editor('return editor.getText().includes("ALTERAÇÃO_NÃO_SALVA")')
            passed('projetos persistem; alterações de documentos exigem salvamento manual')
            app.click('.document-entry')
            assert app.js('return document.querySelectorAll(".editor-scroll").length') == 1
            assert not app.js('return !!document.querySelector("[role=tablist]")')
            app.click('[aria-label^="Nova guia"]')
            wait(lambda: app.js('return document.querySelectorAll("[role=tab]").length') == 2, 'mostrar guias ao criar segunda nota')
            app.key('w', ctrl=True)
            wait(lambda: app.js('return !document.querySelector("[role=tablist]")'), 'ocultar guias ao voltar para uma nota')
            app.key('t', ctrl=True)
            wait(lambda: app.js('return document.querySelectorAll("[role=tab]").length') == 2, 'Ctrl+T cria segunda guia')
            app.key('w', ctrl=True)
            wait(lambda: app.js('return !document.querySelector("[role=tablist]")'), 'ocultar guias')
            app.click('[aria-label="Ocultar navegação"]')
            app.click('[aria-label="Mostrar navegação"]')
            assert app.js('return !document.querySelector(".app").classList.contains("sidebar-hidden")')
            passed('abas, atalhos e abertura sem duplicação')
            app.click('.document-entry')
            app.key('h', ctrl=True)
            app.keys('[aria-label="Localizar no texto"]', 'ideias')
            app.keys('[aria-label="Substituir por"]', 'palavras')
            wait(lambda: app.js('return document.querySelector(".match-count").innerText.includes("2")'), 'pesquisa no documento')
            app.js('return [...document.querySelectorAll(".find-bar button")].find(button=>button.textContent==="Todas").click()')
            assert 'palavras' in app.editor('return editor.getText()')
            app.reveal()
            passed('localizar e substituir')
            app.editor('let range;editor.state.doc.descendants((node,pos)=>{if(node.isText && node.text.startsWith("Algumas")) range={from:pos,to:pos+7}});editor.chain().focus().setTextSelection(range).run();return true')
            app.click('[aria-label="Ferramentas de formatação"]')
            assert app.js('return document.querySelectorAll("[role=toolbar][aria-label=Formatação]").length') == 1
            assert app.js('const tools=document.querySelector(".formatting"), r=tools.getBoundingClientRect(), editor=document.querySelector(".editor-scroll:not(.inactive)").getBoundingClientRect();return r.top>=editor.bottom && r.bottom<=innerHeight-30 && getComputedStyle(tools).borderTopWidth==="0px" && getComputedStyle(tools).boxShadow==="none"')
            selection = app.editor('return {from:editor.state.selection.from,to:editor.state.selection.to}')
            app.choose('Tamanho do texto selecionado', '24px')
            assert app.editor('return editor.getAttributes("textStyle").fontSize') == '24px'
            assert app.editor('return {from:editor.state.selection.from,to:editor.state.selection.to}') == selection
            app.choose('Tamanho do texto selecionado', '')
            assert not app.editor('return editor.getAttributes("textStyle").fontSize')
            app.click('[aria-label="Negrito (Ctrl+B)"]')
            assert app.editor('return editor.isActive("bold")')
            app.click('[aria-label="Negrito (Ctrl+B)"]')
            app.choose('Estilo do parágrafo', '2')
            assert app.editor('return editor.isActive("heading",{level:2})')
            app.choose('Estilo do parágrafo', 'p')
            assert app.editor('return editor.isActive("paragraph")')
            wait(lambda: app.js('return document.querySelector(arguments[0]).textContent.trim()', '[aria-label="Estilo do parágrafo"]') == 'Texto', 'atualizar estilo selecionado')
            time.sleep(.1)
            app.screenshot(output / 'formatting-bottom.png')
            app.hover('[aria-label="Negrito (Ctrl+B)"]')
            wait(lambda: app.js('return document.querySelector("[role=tooltip]")?.innerText.includes("Negrito")'), 'dica acima da formatação')
            assert app.js('return document.querySelector("[role=tooltip]").getBoundingClientRect().bottom <= document.querySelector(".formatting").getBoundingClientRect().top')
            wait(lambda: app.js('return getComputedStyle(document.querySelector("[role=tooltip]")).opacity') == '1', 'terminar animação da dica inferior')
            app.screenshot(output / 'tooltip-formatting.png')
            app.call('/window/rect', {'width': 720, 'height': 780})
            wait(lambda: app.js('return innerWidth') == 720, 'testar formatação em janela estreita')
            app.call('/execute/async', {'script': 'const done=arguments[arguments.length-1];requestAnimationFrame(()=>requestAnimationFrame(()=>done(true)));', 'args': []})
            assert app.js('const r=document.querySelector(".formatting").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight-30')
            before_tools = app.js('return document.querySelector(".editor-scroll:not(.inactive) .tiptap").getBoundingClientRect().toJSON()')
            app.key('f', ctrl=True, shift=True)
            wait(lambda: app.js('return document.querySelector(".app").classList.contains("immersive")'), 'ocultar ferramentas inferiores')
            after_tools = app.js('return document.querySelector(".editor-scroll:not(.inactive) .tiptap").getBoundingClientRect().toJSON()')
            assert before_tools['left'] == after_tools['left'] and before_tools['top'] == after_tools['top'] and before_tools['width'] == after_tools['width']
            app.reveal()
            app.call('/window/rect', original_rect)
            wait(lambda: app.js('return innerWidth') == original_rect['width'], 'restaurar janela após testar ferramentas')
            passed('formatação inferior sem moldura e seletores preservam a seleção')
            app.click('[aria-label="Cor do texto"]')
            app.click('[aria-label="Usar cor #6f94b5"]')
            app.click('[role="dialog"][aria-label="Cor do texto"] .primary')
            wait(lambda: app.editor('return JSON.stringify(editor.getJSON()).includes("#6f94b5")'), 'aplicar cor à seleção do texto')
            passed('seletores de cor próprios preservam o formulário e a seleção do texto')
            app.editor('editor.commands.focus("end");return true')
            app.click('[aria-label="Inserir tabela"]')
            app.choose('Editar tabela', 'row')
            assert app.js('return document.querySelectorAll(".editor-scroll:not(.inactive) table tr").length') == 4
            app.choose('Editar tabela', 'column')
            assert app.js('return document.querySelectorAll(".editor-scroll:not(.inactive) table tr:first-child > *").length') == 4
            app.choose('Editar tabela', 'delete-row')
            app.choose('Editar tabela', 'delete-column')
            assert app.js('return document.querySelectorAll(".editor-scroll:not(.inactive) table tr").length') == 3
            app.choose('Editar tabela', 'delete')
            assert not app.js('return !!document.querySelector(".editor-scroll:not(.inactive) table")')
            passed('menu de tabela executa adição e remoção de linhas e colunas')
            # Insere a imagem pela mesma transação utilizada pelo comando do editor.
            image = root / 'src-tauri/icons/32x32.png'
            data_url = app.ipc('import_image', path=str(image))
            if app.js("return document.querySelector('[aria-label=\"Ferramentas de formatação\"]').getAttribute('aria-pressed')") == 'false':
                app.click('[aria-label="Ferramentas de formatação"]')
            app.click('[aria-label="Inserir imagem"]')
            native_chooser(data_home)
            app.editor('editor.commands.focus("end");return true')
            app.js('const bytes=Uint8Array.from(atob(arguments[0].split(",")[1]),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],"foto.png",{type:"image/png"}));document.querySelector(".editor-scroll:not(.inactive) .tiptap").dispatchEvent(new ClipboardEvent("paste",{clipboardData:transfer,bubbles:true,cancelable:true}));', data_url)
            wait(lambda: app.js('return !!document.querySelector(".editor-scroll:not(.inactive) .tiptap img")'), 'colar imagem')
            app.click('[aria-label="Ferramentas de formatação"]')
            assert not note_path.with_suffix('.assets').exists()
            app.key('s', ctrl=True)
            wait(lambda: note_path.with_suffix('.assets').exists(), 'gravar recursos relativos')
            assert 'data:image' not in note_path.read_text()
            assert 'Entre%20as%20linhas.assets/' in note_path.read_text()
            passed('imagens em memória até salvar e referências relativas reais')
            app.click('[aria-label="Configurações"]')
            for theme, label in [('light', 'Claro'), ('dark', 'Escuro'), ('sepia', 'Sépia Noturno')]:
                app.js('return [...document.querySelectorAll(".theme-choice")].find(button=>button.innerText.includes(arguments[0])).click()', label)
                wait(lambda: app.js('return document.documentElement.dataset.theme') == theme, 'tema ' + theme)
                wait(lambda: app.ipc('plugin:window|theme', label='main') == ('light' if theme == 'light' else 'dark'), 'tema dos diálogos nativos')
                app.click('[role="combobox"][aria-label="Posição da navegação"]')
                expected_surface = {'light':'rgb(255, 255, 255)', 'dark':'rgb(36, 38, 42)', 'sepia':'rgb(51, 46, 39)'}[theme]
                assert app.js('return getComputedStyle(document.querySelector(".select-options")).backgroundColor') == expected_surface
                assert app.js('return document.querySelectorAll("select").length') == 0
                app.screenshot(output / f'select-{theme}.png')
                app.keys('[role="combobox"][aria-label="Posição da navegação"]', '\ue00c')
                assert app.js('return !!document.querySelector("[role=dialog][aria-label=Configurações]")')
                assert not app.js('return !!document.querySelector(".select-options")')
                app.click('[aria-label="Fechar painel"]')
                app.reveal()
                app.editor('editor.commands.setTextSelection(1);editor.commands.blur();return true')
                app.js('document.querySelector(".editor-scroll:not(.inactive)").scrollTop=0;document.querySelector(".toast button")?.click()')
                time.sleep(.25)
                app.screenshot(output / f'{theme}.png')
                if app.js("return document.querySelector('[aria-label=\"Ferramentas de formatação\"]').getAttribute('aria-pressed')") == 'false':
                    app.click('[aria-label="Ferramentas de formatação"]')
                app.click('[aria-label="Cor do texto"]')
                expected_surface = {'light':'rgb(255, 255, 255)', 'dark':'rgb(36, 38, 42)', 'sepia':'rgb(51, 46, 39)'}[theme]
                assert app.js('return getComputedStyle(document.querySelector(".color-picker-body").closest(".modal")).backgroundColor') == expected_surface
                app.screenshot(output / f'color-{theme}.png')
                app.click('[aria-label="Fechar painel"]')
                app.click('[aria-label="Ferramentas de formatação"]')
                app.hover('[aria-label="Salvar documento"]')
                wait(lambda: app.js('return !!document.querySelector("[role=tooltip]")'), 'dica temática de salvar')
                assert app.js('return document.querySelector("[role=tooltip]").innerText.includes("Salvar documento")')
                assert app.js('return getComputedStyle(document.querySelector("[role=tooltip]")).backgroundColor') == expected_surface
                assert not app.js('return !!document.querySelector("button[title]")')
                wait(lambda: app.js('return getComputedStyle(document.querySelector("[role=tooltip]")).opacity') == '1', 'terminar animação da dica')
                app.screenshot(output / f'tooltip-{theme}.png')
                app.click('[aria-label="Configurações"]')
            app.js('return [...document.querySelectorAll(".settings-nav button")].find(button=>button.innerText==="Editor").click()')
            app.choose('Fonte da escrita', 'mono')
            assert app.js('return getComputedStyle(document.querySelector(".tiptap")).fontFamily.includes("Ubuntu Mono")')
            app.choose('Fonte da escrita', 'serif')
            app.js('return [...document.querySelectorAll(".settings-nav button")].find(button=>button.innerText==="Cursor").click()')
            app.js('return [...document.querySelectorAll(".cursor-choice")].find(button=>button.innerText.includes("Invisível")).click()')
            assert app.js('return document.querySelector(".editor-scroll:not(.inactive)").dataset.cursor') == 'hidden'
            app.js('return [...document.querySelectorAll(".cursor-choice")].find(button=>button.innerText.includes("Fino")).click()')
            assert app.js('return document.querySelector(".editor-scroll:not(.inactive)").dataset.cursor') == 'thin'
            app.click('[aria-label="Fechar painel"]')
            app.click('[aria-label="Fechar aplicativo"]')
            time.sleep(.3)
            app.stop()
            app.start()
            assert app.js('return document.documentElement.dataset.theme') == 'sepia'
            assert app.js('return document.querySelector(".editor-scroll").dataset.cursor') == 'thin'
            passed('três temas, três cursores, capturas reais e preferências entre execuções')
            passed('dicas de botões acompanham os três temas e exibem os atalhos')
            app.click('[aria-label="Configurações"]')
            app.choose("Posição da navegação", "right")
            app.choose("Posição das abas", "left")
            app.click('[aria-label="Fechar painel"]')
            assert app.js('return document.querySelector(".app").classList.contains("sidebar-right")')
            assert app.js('return document.querySelector(".app").classList.contains("tabs-left")')
            passed('navegação à direita e abas laterais')
            app.key('F11')
            wait(lambda: app.ipc('plugin:window|is_fullscreen', label='main'), 'entrar em tela cheia')
            app.key('F11')
            wait(lambda: not app.ipc('plugin:window|is_fullscreen', label='main'), 'sair da tela cheia')
            time.sleep(.6)  # O compositor ainda pode estar animando a saída.
            passed('F11 alterna a tela cheia nativa')
            # Compara alterações externas usando o arquivo já salvo.
            if app.js('return document.querySelector(".project-toggle").getAttribute("aria-expanded")') == 'false':
                app.click('.project-toggle')
            app.click('.document-entry')
            wait(lambda: app.editor('return editor.getText().includes("O que cabe")'), 'abrir documento antes do conflito')
            app.editor('editor.commands.insertContent(" texto local");return true')
            note_path.write_text('ALTERAÇÃO EXTERNA', encoding='utf-8')
            app.key('s', ctrl=True)
            wait(lambda: app.js('return !!document.querySelector("[role=dialog]")'), 'conflito de salvamento')
            assert 'O arquivo no disco é diferente' in app.js('return document.body.innerText')
            app.js('return [...document.querySelectorAll(".modal-actions button")].find(button=>button.innerText==="Cancelar").click()')
            assert note_path.read_text() == 'ALTERAÇÃO EXTERNA'
            passed('conflitos externos preservam o arquivo ao cancelar')
            app.js('return [...document.querySelectorAll(".nav-button")].find(button=>button.innerText.includes("Buscar documentos")).click()')
            app.keys('[aria-label="Buscar documentos salvos"]', 'EXTERNA')
            wait(lambda: app.js('return !!document.querySelector(".search-result")'), 'busca nos arquivos salvos')
            assert 'Entre as linhas.md' in app.js('return document.querySelector(".search-result").innerText')
            app.click('[aria-label="Fechar painel"]')
            passed('busca global lê o conteúdo salvo no disco')
            app.click('[aria-label="Configurações"]')
            app.js('return [...document.querySelectorAll(".settings-nav button")].find(button=>button.innerText==="Comportamento").click()')
            app.js('document.querySelectorAll(".settings-content input.switch")[1].click()')
            app.click('[aria-label="Fechar painel"]')
            app.key('w', ctrl=True)
            wait(lambda: app.js('return document.body.innerText.includes("Salvar antes de fechar?")'), 'confirmação configurável')
            app.js('return [...document.querySelectorAll(".modal-actions button")].find(button=>button.innerText==="Cancelar").click()')
            assert app.js('return document.querySelectorAll(".editor-scroll").length') == 1
            app.key('w', ctrl=True)
            wait(lambda: app.js('return document.body.innerText.includes("Salvar antes de fechar?")'), 'confirmação de descarte')
            app.js('return [...document.querySelectorAll(".modal-actions button")].find(button=>button.innerText==="Descartar").click()')
            wait(lambda: app.editor('return editor.getText()') == "", 'descartar nota')
            passed('confirmação de descarte opcional respeita cancelar e descartar')
            app.click('[aria-label="Configurações"]')
            app.js('return [...document.querySelectorAll(".settings-nav button")].find(button=>button.innerText==="Comportamento").click()')
            app.js('document.querySelectorAll(".settings-content input.switch")[1].click()')
            app.js('return [...document.querySelectorAll(".settings-nav button")].find(button=>button.innerText==="Arquivos").click()')
            app.choose("Formato de novas notas", "txt")
            app.click('[aria-label="Fechar painel"]')
            app.key('n', ctrl=True)
            wait(lambda: app.js('return document.querySelector(".window-title").innerText.includes("TXT")'), 'formato padrão TXT')
            app.editor('editor.commands.setContent({type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"**literal** em UTF-8: 日本語"}]}]});return true')
            app.key('s', ctrl=True)
            txt_path = downloads / 'Texto.txt'
            native_chooser(data_home, txt_path)
            wait(txt_path.exists, 'salvar TXT')
            assert txt_path.read_text() == '**literal** em UTF-8: 日本語'
            passed('formato padrão TXT e salvamento textual real')
            # Simulação de composição verifica que atalhos não interrompem o IME.
            before_tabs = app.js('return document.querySelectorAll("[role=tab]").length')
            app.js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"n",ctrlKey:true,isComposing:true,bubbles:true}))')
            assert app.js('return document.querySelectorAll("[role=tab]").length') == before_tabs
            long_text = '<p>' + 'Escrever com calma. 日本語 Grüß Gott. ' * 8000 + '</p>'
            started = time.monotonic()
            app.editor('editor.commands.setContent(arguments[0]);return true', long_text)
            app.editor('editor.chain().focus("end").insertContent(" FIM").run();return true')
            elapsed = time.monotonic() - started
            assert app.editor('return editor.getText().endsWith(" FIM")')
            passed(f'composição preserva atalhos; documento longo ({len(long_text) - 7} caracteres) em {elapsed:.2f}s')
            app.click('[aria-label="Fechar aplicativo"]')
            time.sleep(.2)
            app.stop()
            (output.parent / 'desktop-results.json').write_text(json.dumps({'passed': len(results), 'checks': results, 'engine': 'Tauri 2 / WebKitGTK', 'platform': 'Ubuntu 26.10 / Wayland'}, ensure_ascii=False, indent=2))
            print(f'\n{len(results)} verificações desktop passaram.', flush=True)
        finally:
            app.stop()
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill()
            log.close()


if __name__ == '__main__':
    main()
