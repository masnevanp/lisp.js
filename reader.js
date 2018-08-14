const { SpForms, List, Nil } = require('./eval');
const { getSym } = require('./env');
const { pushUnique } = require('./utils');


const STR_DELIM = '"';
const BEGIN_LIST = '(';
const END_LIST = ')';
const DELIMS = [BEGIN_LIST, END_LIST];
const CONSTANTS = {
  'true': true,
  'false': false,
  'nil': Nil
};

const SyntaxMap = () => {
  const syntaxMap = new Map();

  Object.keys(SpForms).forEach(
    key => syntaxMap.set(key, { eval: SpForms[key], syntax: key })
  );

  return {
    get: syntax => syntaxMap.get(syntax),
  };
};

const syntaxMap = SyntaxMap();


const isWhitespace = ch => /\s/.test(ch);


const Tokenizer = (prefixes = [], delims = DELIMS, custTokers = []) => {
  let mode;
  let tokens;
  let nextToken;

  const reset = () => {
    mode = modeNormal;
    tokens = [];
    nextToken = '';
  };

  const isPreFix = ch => prefixes.indexOf(ch) >= 0;

  const isDelim = ch => delims.indexOf(ch) >= 0;

  const pushNext = () => {
    if (nextToken !== '') {
      let token = { token: nextToken }; // generic token
      for (toker of custTokers) {
        let custToken = toker(nextToken);
        if (custToken) {
          token = custToken;
          break;
        }
      }

      tokens.push(token);
      nextToken = '';
    }
  };

  const modeNormal = ch => {
    if (!isWhitespace(ch)) {
      if (ch === STR_DELIM) {
        pushNext();
        mode = modeStr;
      } else if (isDelim(ch)) {
        pushNext();
        tokens.push({ delim: ch, asStr: ch });
      } else if (isPreFix(ch) && nextToken === '') {
        tokens.push({ prefix: ch, asStr: ch });
      } else {
        nextToken = nextToken.concat(ch);
      }
    } else {
      pushNext();
    }
  };

  const modeStr = ch => {
    if (ch === STR_DELIM) {
      tokens.push({ str: nextToken });
      nextToken = '';
      mode = modeNormal;
    } else {
      nextToken = nextToken.concat(ch);
    }
  };

  reset();

  return {
    tokenize: chars => {
      for (let ch of chars || '') mode(ch)
    },
    end: () => {
      if (mode === modeStr) throw new Error(`'${STR_DELIM}' expected [tokenizer]`);
      else pushNext();
    },
    peek: () => tokens[0],
    next: () => tokens.shift(),
    reset, 
  };
};


const QuoteMacro = rdrServices => {
  const { formReader, incDepth } = rdrServices;
  const QUOTE_PRE_FIX = "'";

  const quotedReader = output => ({
    name: 'quoted',
    read: (formReader(expr => {
      output(List([syntaxMap.get('quote'), expr]));
    })).read,
  });

  const match = toker => {
    if (toker.peek().prefix === QUOTE_PRE_FIX) {
      toker.next();
      incDepth(); // TODO: move above...
      return quotedReader;
    }
  };

  return {
    prefixes: [QUOTE_PRE_FIX],
    match
  };
};

const LambdaMacro = rdrServices => {
  const { formReader, switchReader, incDepth, decDepth } = rdrServices;
  const BEGIN_DELIM = '[';
  const END_DELIM = ']';
  const LAMBDA_PARAM_PREFIX = '\\';

  const lambdaReader = output => {
    const params = [];
    const body = [];

    const addExpr = expr => {
      body.push(expr);
      switchReader(rdr);
    }

    const rdr = {
      name: 'lambda',
      read: toker => {
        const token = toker.peek();
        if (token.delim === END_DELIM) {
          toker.next();
          decDepth();
          output(List([syntaxMap.get('fn'), List(params), List(body)]));
        } else if (token.lambdaPar) {
          toker.next();
          const sym = getSym(token.lambdaPar);
          pushUnique(sym, params);
          addExpr(sym);
        } else {
          switchReader(formReader(addExpr));
        }
      },
    };

    incDepth();

    return rdr;
  };

  const lmabdaParToker = token => {
    if (token.length > 1 && token.startsWith(LAMBDA_PARAM_PREFIX)) {
      return {
        lambdaPar: token.slice(1),
        asStr: token,
      };
    }
  };

  const match = toker => {
    if (toker.peek().delim === BEGIN_DELIM) {
      toker.next();
      return lambdaReader;
    }
  };

  return {
    delims: [BEGIN_DELIM, END_DELIM],
    custTokers: [lmabdaParToker],
    match
  };
};


const Reader = (output, macroConstructors = [QuoteMacro, LambdaMacro]) => {
  let toker;
  let macroMatchers = [];
  let reader;
  let depth;
  
  const switchTo = rdr => reader = rdr;
  const incDepth = () => ++depth;
  const decDepth = () => --depth;

  const init = () => {
    const rdrServices = {
      formReader, listReader, atomReader,
      switchReader: switchTo,
      incDepth, decDepth
    };
    const prefixes = [];
    const delims = [];
    const custTokers = [];

    for (let macroCtr of macroConstructors) {
      const macro = macroCtr(rdrServices);
      macroMatchers.push(macro.match);
      macro.prefixes && prefixes.push(...macro.prefixes);
      macro.delims && delims.push(...macro.delims);
      macro.custTokers && custTokers.push(...macro.custTokers);
    }

    toker = Tokenizer(prefixes, DELIMS.concat(delims), custTokers);

    reset();
  };

  const reset = () => {
    toker.reset();
    ready(null);
  };

  const status = () => ({
    state: reader.name,
    depth,
  });

  const ready = expr => {
    if (expr !== null) output(expr);
    switchTo(readyReader);
    depth = 0;
  }
  
  const readyReader = {
    name: 'ready',
    read: () => switchTo(formReader(ready)),
  };

  const matchMacro = toker => {
    let macroReader;
    macroMatchers.find(matcher => {
      macroReader = matcher(toker);
      return (macroReader !== undefined);
    });
    return macroReader;
  };

  const formReader = output => ({
    name: 'form',
    read: toker => {
      if (toker.peek().delim === BEGIN_LIST) {
        switchTo(listReader(output));
      } else {
        const macroReader = matchMacro(toker);
        if (macroReader) {
          switchTo(macroReader(output));
        } else {
          switchTo(atomReader(output));
        }
      }
    },
  });

  const listReader = output => {
    const list = [];

    const addItem = item => {
      list.push(item);
      switchTo(rdr);
    }

    const rdr = {
      name: 'list',
      read: toker => {
        if (toker.peek().delim === END_LIST) {
          toker.next();
          decDepth();
          output({ list });
        } else {
          switchTo(formReader(addItem));
        }
      },
    };

    toker.next();
    incDepth();

    return rdr;
  };

  const atomReader = output => ({
    name: 'atom',
    read: toker => {
      const token = toker.next();

      if (token.hasOwnProperty('str')) return output(token.str);

      const atom = token.token;

      if (!atom) {
        throw new Error(
          `'${token.asStr || JSON.stringify(token)}' unexcpected [reader]`
        );
      }

      const syntax = syntaxMap.get(atom);
      if (syntax) return output(syntax);

      if (CONSTANTS.hasOwnProperty(atom)) return output(CONSTANTS[atom]);

      const num = Number(atom);
      if (!Object.is(NaN, num)) return output(num);

      output(getSym(atom));
    },
  });

  const feedTokens = () => {
    while (toker.peek()) {
      reader.read(toker);
    }
  };

  init();

  return {
    read: chars => {
      toker.tokenize(chars);
      feedTokens();
    },
    end: () => {
      toker.end();
      feedTokens();
    },
    reset,
    status,
  };
};


module.exports = { Reader };
