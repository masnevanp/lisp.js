
const Env = (initBinds = {}, parent = undefined) => ({
  parent,
  binds: Object.assign({}, initBinds),
});


const def = (name, val, env) => {
  if (env.binds[name] !== undefined) throw new Error(`'${name}' already defined`);
  else return env.binds[name] = val;
};


const get = (name, env) => {
  while (env) {
    let v = env.binds[name];
    if (v !== undefined) return v;
    else env = env.parent;
  }
};


const set = (name, val, env) => {
  if (val === undefined) throw new Error(`set! ${name} undefined`);

  while (env) {
    if (env.binds[name] !== undefined) return env.binds[name] = val;
    else env = env.parent;
  }

  throw new Error(`'${name}' undefined`);
};


const SymbolSet = () => {
  const symbolSet = new Map();

  const get = name => {
    let sym = symbolSet.get(name);
    if (!sym) {
      sym = { sym: name };
      symbolSet.set(name, sym);
    }
    return sym;
  };

  return { get };
};

const symbolSet = SymbolSet();


module.exports = {
  Env, def, get, set,
  getSym: name => symbolSet.get(name),
};
