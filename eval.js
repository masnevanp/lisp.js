const { Env, def, get, set, getSym } = require('./env');


const Nil = {
  proc: () => Nil,
  str: 'nil',
};

const nilToUndefined = x => x === Nil ? undefined : x;

const toStr = expr => BuiltIn.str.proc([expr]);

const isTrue = val => (val !== false && val !== Nil);

const isStream = val => val && val.next ? true : false;


const List = arr => ({
  list: arr,
  proc: args =>
          args.length === 1
            ? arr[args[0]]
            : List(arr.slice(nilToUndefined(args[0]), nilToUndefined(args[1]))),
});

const EmptyStream = () => ({
  next: () => Nil,
  hasNext: () => false,
  proc: procChain,
});

const ListStream = arr => {
  let n = arr.length;
  let cur = 0;

  const listStream = {
    next: () => cur < n ? arr[cur++] : Nil,
    hasNext: () => cur < n,
  };

  listStream.proc = args => procChain([listStream, ...args]);

  return listStream;
};

const ProcStream = (procNext, procHasNext) => {
  if (procHasNext) {
    const procStream = {
      next: () => procNext([]),
      hasNext: () => procHasNext([]),
    };

    procStream.proc = args => procChain([procStream, ...args]);

    return procStream;
  } else {
    let cached = Nil;

    const procStream = {
      next: () => {
        let nxt;
        if (cached !== Nil) {
          nxt = cached;
          cached = Nil;
        } else {
          nxt = procNext([]);
        }
        return nxt;
      },
      hasNext: () => {
        if (cached !== Nil) return true;
        cached = procNext([]);
        return cached !== Nil;
      },
    };

    procStream.proc = args => procChain([procStream, ...args]);

    return procStream;
  };
};

const Stream = args => {
  const src1 = args[0];
  if (src1 === Nil) return EmptyStream();
  if (src1.list) return ListStream(src1.list);
  if (src1.proc) return ProcStream(src1.proc, args[1] && args[1].proc);
  return ListStream(args);
  //throw new Error('not streamable');
};

//const ErrorTrap = errMsg => () => { throw new Error(errMsg); };

const Fn = (params, fnBody, outerEnv, variadic = false) => {
  let parCnt = params.length;
  
  const proc = args => {
    if (args.length !== parCnt) throw new Error(`${parCnt} args expected`);

    const initEnv = {};
    for (let i = 0; i < parCnt; ++i) {
        initEnv[params[i].sym] = args[i];
    }

    let fnEnv = Env(initEnv, outerEnv);
    let val;
    for (let expr of fnBody) {
      val = eval(expr, fnEnv);
    }
    return val;
  };
  
  return variadic ? {
    proc: args => {
      if (args.length < 1) throw new Error('At least 1 arg expected');
      return proc([args[0], List(args.slice(1))]);
    },
    str: `(${toStr(params[0])} & ${toStr(params[1])}) ...`,
  } : {
    proc,
    str: `(${params.map(p => toStr(p)).join(' ')}) ...`,
  };
};


const MultiArityFn = (fnDefs, outerEnv, name = 'fn') => {
  let arities = [];
  let fnCnt = 0;
  let fn;
  let variadicFn;
  
  for (let fnDef of fnDefs) {
    let params = fnDef[0].list;
    let parCnt = params.length;
    const fnBody = fnDef.slice(1);

    if (params[1] && params[1].sym === '&') { // variadic ?
      if (variadicFn) throw new Error('Only 1 variadic (x & xs) allowed');
      params = [params[0], params[2]];
      parCnt = 2;
      variadicFn = Fn(params, fnBody, outerEnv, true);
    } else {
      fn = Fn(params, fnBody, outerEnv);
      if (arities[parCnt]) {
        throw new Error('Same arity in multi-arity fn');
      } else {
        arities[parCnt] = fn;
      }
    }

    ++fnCnt
  }

  if (fnCnt === 1) {
    theFn = fn || variadicFn;
    return {
      proc: theFn.proc,
      str: `(${name} ${theFn.str})`,
    };
  } else {
    const proc = args => {
      const theFn = arities[args.length] || variadicFn;
      if (theFn) return theFn.proc(args);
      else throw new Error('Undefined arity');
    }

    let str = `\n  (${name}\n`;
    str = str.concat(arities.filter(x => x).map(fn => `    (${fn.str})`).join('\n'));
    if (variadicFn) str = str.concat(`\n    (${variadicFn.str})`);
    str = str.concat('\n  )');

    return { proc, str };
  }
};


const SpForms = {
  if: (body, env) => isTrue(eval(body[0], env)) ? eval(body[1], env) : eval(body[2], env),

  def: (body, env) => {
    let name = body[0].sym || eval(body[0], env).sym;
    if (name === undefined) throw new Error(`invalid name '${toStr(body[0])}'`);
    let val = eval(body[1], env);
    return def(name, val, env);
  },

  fn: (body, outerEnv, name = 'fn') => {
    if (body[0].list && body[0].list[0] && body[0].list[0].list) {
      return MultiArityFn(body.map(f => f.list), outerEnv, name);
    } else {
      return MultiArityFn([body], outerEnv, name); // special case: rewrite
    }
  },

  defn: (body, env) => {
    let name = body[0].sym || eval(body[0], env).sym;
    if (name === undefined) throw new Error(`invalid name '${toStr(body[0])}'`);
    let fn = SpForms.fn(body.slice(1), env, name);
    return def(name, fn, env);
  },

  quote: body => body[0],

  do: (body, env) => {
    let val;
    body.forEach(expr => val = eval(expr, env));
    return val;
  },

  let: (body, outerEnv) => {
    const initEnv = {};
    for (let bind of body[0].list) {
      const sym = bind.list[0].sym;
      const expr = bind.list[1];
      initEnv[sym] = eval(expr, outerEnv);
    }
    const letEnv = Env(initEnv, outerEnv);

    let letBody = body.slice(1);
    let val;
    for (let expr of letBody) {
      val = eval(expr, letEnv);
    }
    return val;
  },

  loop: (loopBody, env) => {
    for (;;) for(let expr of loopBody) {
      let val = eval(expr, env);
      if (val && val.eval === SpForms.break) return; // TODO: rename 'break' -> 'loop-break' ?
    }
  },

  break: () => { throw new Error("Misplaced 'break'") },

  try: (body, env) => {
    let val;
    let bodyIdx;

    const isCatch = expr => expr.list && expr.list[0].eval === SpForms.catch;
    const isFinally = expr => expr.list && expr.list[0].eval === SpForms.finally;

    const matchCatcher = (exceptId, catcherId) => {
      if (exceptId === catcherId || catcherId === '...') return true;

      const eId = exceptId.split('.');
      const cId = catcherId.split('.');

      for (let c = 0; c < cId.length; ++c) {
        if (cId[c] !== eId[c]) return false;
      }

      return true;
    };

    const findCatcher = except => {
      const exceptId = except.id.sym;

      for (; bodyIdx < body.length; ++bodyIdx) {
        let candidate = body[bodyIdx];
        if (isFinally(candidate)) return undefined;
        else if (isCatch(candidate)) {
          candidate = candidate.list;
          const candidateId = candidate[1] && candidate[1].sym;
          if (!candidateId) throw new Error(`invalid id '${toStr(catcher[1])} [catch]'`);
          if (matchCatcher(exceptId, candidateId)) return candidate;
        }
      }
      return undefined;
    };

    const handle = except => {
      val = undefined;

      const catcher = findCatcher(except);
      if (catcher) {
        const bindName = catcher[2] && catcher[2].sym;
        if (!bindName) throw new Error(`invalid name '${toStr(catcher[2])} [catch]'`);

        // TODO: as dict (at least except)??
        const eEnv = Env(
          {
            [bindName]: List([except.id, except.val, except])
          },
          env
        );

        for (let cIdx = 3; cIdx < catcher.length; ++cIdx) {
          val = eval(catcher[cIdx], eEnv);
        }

        return true;
      } else {
        return false;
      }
    };

    const evalFinally = expr => {
      const finExprs = expr.list;
      for (let fIdx = 1; fIdx < finExprs.length; ++fIdx) {
        eval(finExprs[fIdx], env);
      }
    };

    // NOTE: Catchers don't have to be at the end (before 'finally'),
    //       but in case of an exception the catchers 'above' are not checked.
    try {
      for (bodyIdx = 0; bodyIdx < body.length; ++bodyIdx) {
        const expr = body[bodyIdx];
        if (isCatch(expr)) {
          continue;
        }
        else if (isFinally(expr)) {
          evalFinally(expr);
          break;
        }
        else val = eval(expr, env);
      }
      return val;
    } catch (err) {
      if (err.id === undefined) err.id = getSym(err.name);
      if (err.val === undefined) err.val = err.message;

      ++bodyIdx;
      try {
        if (handle(err)) err = undefined;
      } catch (newErr) {
        err = newErr;
      }

      for (; bodyIdx < body.length; ++bodyIdx) {
        const expr = body[bodyIdx];
        if (isFinally(expr)) {
          evalFinally(expr);
          break;
        }
      }

      if (err) throw err;
      else return val;
    }
  },

  throw: (body, env) => {
    if (!body[0] || !body[0].sym) throw new Error('Missing/invalid exception id');

    const except = new Error('Program exception');
    except.id = body[0];
    except.val = eval(body[1], env);

    throw except;
  },

  catch: () => { throw new Error("Misplaced 'catch'") },
  finally: () => { throw new Error("Misplaced 'finally'") },
};

SpForms['set!'] = (body, env) => {
  let name = body[0].sym || eval(body[0], env).sym;
  if (name === undefined) throw new Error('invalid name');
  return set(name, eval(body[1], env), env);
};

SpForms['let*'] = (body, outerEnv) => {
  const letEnv = Env({}, outerEnv);
  for (let bind of body[0].list) {
    const sym = bind.list[0].sym;
    const expr = bind.list[1];
    letEnv.binds[sym] = eval(expr, letEnv);
  }

  let letBody = body.slice(1);
  let val;
  for (let expr of letBody) {
    val = eval(expr, letEnv);
  }
  return val;
};


const eq = (a, b) => {
  if (a === b) return true;

  if (a && a.list) {
    if (b && b.list) {
      let n = a.list.length;
      if (n === b.list.length) {
        for (let i = 0; i < n; ++i) {
          if (!eq(a.list[i], b.list[i])) return false;
        }
        return true;
      }
    }
    return false;
  }

  return Object.is(a, b);
};

const procEq = args => {
  const fst = args[0];
  if (!eq(fst, args[1])) return false;
  for (let i = 2; i < args.length; ++i) {
    if (!eq(fst, args[i])) return false;
  }
  return true;
};

const procCompose = args => {
  const procs = [];
  const procCnt = args.length;

  for (let i = 0, j = procCnt-1; j >= 0; ++i, --j) {
    procs[i] = args[j].proc;
  }

  return { proc: args => {
    let val = procs[0](args);
    for (let i = 1; i < procCnt; ++i) {
      val = procs[i]([val]);
    }
    return val;
  }};
};

const procPipe = procs => {
  return {
    proc: args => {
      let val = procs[0].proc(args);
      for (let p = 1; p < procs.length; ++p) {
        val = procs[p].proc([val]);
      }
      return val;
    }
  };
};

const procMap = args => {
  const fn = args[0].proc;
  return List(args[1].list.map(x => fn([x])));
};

const procMapStream = args => {
  const fn = args[0].proc;
  const stream = args[1];

  const next = () => {
    const nxt = stream.next();
    return (nxt !== Nil) ? fn([nxt]) : Nil;
  };

  return ProcStream(next, stream.hasNext);
};

const procSlice = args => {
  let slice = args[0].slice && args[0].slice.bind(args[0]);
  if (slice) return slice(nilToUndefined(args[1]), nilToUndefined(args[2]));
  slice = args[0].list.slice.bind(args[0].list);
  return List(slice(nilToUndefined(args[1]), nilToUndefined(args[2])));
};

const procChain = args => {
  const streams = [];
  for (arg of args) {
    if (isStream(arg)) streams.push(arg);
    else throw new Error(`'${toStr(arg)}' not a stream`);
  }

  if (streams.length === 0) return EmptyStream();

  let curIdx = 0;
  let curStream = streams[0];

  const nextNonEmpty = () => {
    while (++curIdx < streams.length) {
      curStream = streams[curIdx];
      if (curStream.hasNext()) return true;
    }
    return false;
  };

  const next = () => {
    let nxt = curStream.next();
    if (nxt !== Nil) return nxt;
    else if (!nextNonEmpty()) return Nil;
    else return curStream.next();
  };

  const hasNext = () => {
    if (curStream.hasNext()) return true;
    else return nextNonEmpty();
  }

  return ProcStream(next, hasNext);
};

const procStr = args => {
  var expr = args[0];

  if (expr.next) return "stream";
  if (expr.list) return `(${expr.list.map(x => procStr([x])).join(' ')})`;
  if (expr.sym) return expr.sym;
  if (expr.syntax) return expr.syntax;
  if (expr.str) return expr.str;
  if (expr.proc) return "proc"; // TODO
  if (typeof expr === 'string' || expr instanceof String) return `"${expr}"`;
  return String(expr);
}

const procInspect = things => {
  var s = '';
  for (let thing of things) {
    s = s.concat(`${JSON.stringify(thing, null, 2)} : ${typeof thing}\n`);
  }
  return s;
};

// TODO: arg cnt check ( add a argCnt to these? )
const BuiltIn = {
  'true': true,
  'false': false,
  'proc?': { proc: args => args[0] && args[0].proc ? true : false },
  '=': { proc: procEq },
  '+': { proc: args => args.reduce((a, b) => a + b, 0) },
  '-': { proc: args => args.length === 1 ? -args[0] : args.reduce((a, b) => a - b, args[0]*2) },
  '*': { proc: args => args.reduce((a, b) => a * b, 1) },
  '1st': { proc: args => args[0].list[0] },
  '2nd': { proc: args => args[0].list[1] },
  '3rd': { proc: args => args[0].list[2] },
  'nth': { proc: args => args[1].list[args[0]-1] },
  'rest': { proc: args => List(args[0].list.slice(1)) },
  'compose': { proc: procCompose },
  'apply': { proc: args => args[0].proc(args[1].list) },
  'map': { proc: procMap },
  'list': { proc: args => List(args) },
  'cons': { proc: args => List([args[0]].concat(args[1].list)) },
  'reduce': { proc: args => args[2].list.reduce((a, b) => args[0].proc([a, b]), args[1]) },
  'and?': { proc: args => args.findIndex(x => !isTrue(x)) === -1 }, // NOTE: '(and)' ==> 'true'
  'or?': { proc: args => args.findIndex(x => isTrue(x)) > -1 }, // NOTE: '(or)' ==> 'false'
  'true?': { proc: args => args.length ? isTrue(args[0]) : false },
  'false?': { proc: args => !isTrue(args[0]) },
  'nil?': { proc: args => args[0] == Nil },
  'empty?': { proc: args => args[0].list.length === 0 },
  'next': { proc: args => args[0].next() },
  'next?': { proc: args => args[0].hasNext() },
  'stream': { proc: args => Stream(args) },
  'stream?': { proc: args => isStream(args[0]) },
  'map-stream': { proc: procMapStream },
  'pipe': { proc: procPipe },
  'len': { proc: args => args[0].length || args[0].list.length },
  'slice': { proc: procSlice },
  'chain': { proc: procChain },
  'sym': { proc: args => getSym(args[0]) },
  'sym?': { proc: args => args[0].hasOwnProperty('sym') },
  'str': { proc: procStr },
  'evalc': { proc: (args, env) => eval(args[0], env) }, // evals in current env
  'inspect': { proc: procInspect },
};

const bindFunc = f => ({ proc: args => f(...args) });

const MathFunc = [ // TODO: use 'namespace', e.g. 'Math.exp' ?
  'exp', 'log', 'log2', 'pow', 'sqrt', 'max', 'min', 'random',
  'abs', 'round',
];

const MathConst = [
  'PI', 'E',
];

for (let f of MathFunc) BuiltIn[f] = bindFunc(Math[f]);
for (let c of MathConst) BuiltIn[c] = Math[c];


const Global = {
  'not': BuiltIn['false?'],
  'all?': BuiltIn['and?'],
  'any?': BuiltIn['or?'],
  '~': BuiltIn.stream,
  'map~': BuiltIn['map-stream'],
  '~~': BuiltIn.chain,
  '.': BuiltIn.compose,
  '<~': BuiltIn.next,
  'zero?': { proc: args => args[0] === 0 },
  'none?': { proc: args => !BuiltIn['or?'].proc(args) },
  'id': { proc: args => args[0] }, 
  'val': { proc: args => args[0] },
};

const GlobalEnv = (globalBinds) => Env(Object.assign({}, Global, globalBinds));


const eval = (expr, env) => {
  if (expr === undefined) return Nil;

  const name = expr.sym;
  if (name) {
    let val = get(name, env);
    if (val === undefined) val = BuiltIn[name];
    if (val === undefined) throw new Error(`'${name}' undefined`)
    return val;
  }

  if (expr.list && expr.list.length > 0) {
    let val;
    const spEval = expr.list[0].eval;
    if (spEval) {
      val = spEval(expr.list.slice(1), env);
    } else {
      const el = expr.list.map(e => eval(e, env));
      const firstElem = el[0].proc; // just for a nicer error msg...
      val = firstElem(el.slice(1), env);
    }
    return val !== undefined ? val : Nil;
  } else {
    return expr;
  }
};



const ProcRead = Reader => {
  const rdr = Reader(e => exprs.push(e));
  let exprs;

  return args => {
    if (args[0] === undefined) return rdr.reset();

    const exprStr = args[0];
    const errorOnIncomplete = args[1] === undefined ? true : args[1];

    exprs = [];

    rdr.read(exprStr);
    rdr.end();

    if (errorOnIncomplete && rdr.status().state !== 'ready') {
      rdr.reset();
      throw new Error("Incomplete expression(s) [read]");
    } else {
      return List(exprs);
    }
  }
};

const Eval = (globalBinds = {}, Reader) => {
  const gEnv = GlobalEnv(globalBinds);
  const boundEval = (expr, env = gEnv) => eval(expr, env);

  gEnv.binds['eval'] = { proc: args => eval(args[0], gEnv) };
  if (Reader) {
    gEnv.binds['read'] = { proc: ProcRead(Reader) };
  }

  return {
    eval: boundEval,
    env: gEnv,
  };
}


module.exports = {
  Eval,
  SpForms,
  List,
  toStr,
  Nil,
};
