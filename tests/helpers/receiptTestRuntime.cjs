const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const filePath = path.resolve(__dirname, '../..', relativePath);
  const code = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React
    }
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Error, AbortController, setTimeout, clearTimeout,
    require(name) {
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
      return dependencies[name];
    },
    ...globals
  }, { filename: filePath });
  return exports;
}

// Harness de hooks para testar handlers reais sem instalar um renderer React.
// Não substitui os testes visuais e de interação nativa da Etapa 5.
function createHookRuntime() {
  const hooks = [];
  let index = 0;
  let pending = [];
  let dirty = false;
  let component;
  let props;
  let tree;
  const createElement = (type, attributes, ...children) => ({
    type, props: { ...attributes, children: children.flat() }
  });
  const react = {
    default: { createElement, Fragment: 'Fragment' },
    useState(initial) {
      const position = index++;
      if (!(position in hooks)) hooks[position] = { value: initial };
      return [hooks[position].value, value => {
        const next = typeof value === 'function' ? value(hooks[position].value) : value;
        if (!Object.is(next, hooks[position].value)) dirty = true;
        hooks[position].value = next;
      }];
    },
    useRef(initial) {
      const position = index++;
      if (!(position in hooks)) hooks[position] = { current: initial };
      return hooks[position];
    },
    useEffect(effect, dependencies) {
      const position = index++;
      const previous = hooks[position];
      if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        pending.push(() => {
          previous?.cleanup?.();
          hooks[position] = { dependencies, cleanup: effect() };
        });
      }
    }
  };
  function render(nextProps = props) {
    props = nextProps;
    let rounds = 0;
    do {
      dirty = false;
      index = 0;
      pending = [];
      tree = component(props);
      pending.forEach(effect => effect());
      if (++rounds > 20) throw new Error('Unexpected render loop');
    } while (dirty);
    return tree;
  }
  return {
    react,
    mount(value, initialProps) { component = value; return render(initialProps); },
    render,
    unmount() { hooks.forEach(hook => hook.cleanup?.()); },
    get tree() { return tree; }
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  for (const child of tree.props?.children ?? []) {
    const found = find(child, predicate);
    if (found) return found;
  }
}

function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return (tree?.props?.children ?? []).map(text).join('');
}

function button(tree, label) {
  return find(tree, node => node.type === 'TouchableOpacity' && text(node).trim() === label);
}

const native = {
  StyleSheet: { create: styles => styles },
  Platform: { OS: 'android' },
  Keyboard: { dismiss() {} },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  ...Object.fromEntries([
    'View', 'Text', 'ScrollView', 'SafeAreaView', 'TouchableOpacity', 'Modal',
    'TextInput', 'KeyboardAvoidingView', 'TouchableWithoutFeedback', 'ActivityIndicator'
  ].map(name => [name, name]))
};

module.exports = { loadTypeScript, createHookRuntime, find, text, button, native };
