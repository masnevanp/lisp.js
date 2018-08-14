const { History } = require('./utils');
const { Eval, List, toStr } = require('./eval');
const { Reader } = require('./reader');


const REP_LAST_VAL = '_';
const REP_HIST = '__';
const REP_HIST_LENGTH = 100;


const REP = (id, initEnv, print) => {
  const eval = Eval(initEnv, Reader);

  const error = msg => print(`** Error: ${msg} **\n\n`);

  const repHist = History(REP_HIST_LENGTH);
  let repHistLst;

  const reader = Reader(expr => {
    try {
      const val = eval.eval(expr);

      if (val !== repHistLst) { // would break stuph...
        repHist.add(List([expr, val]));
        repHistLst = List(repHist.hist.slice());
        eval.env.binds[REP_HIST] = repHistLst;
        eval.env.binds[REP_LAST_VAL] = val;
      }

      print(`=> ${toStr(val)}\n\n`);
      //print(`${JSON.stringify(expr,null,2)} `);
      //print(`=> ${JSON.stringify(toStr(val),null,2)}\n`);
    } catch (err) {
      const errMsg = err.id
              ? `Uncaught '${err.id && err.id.sym || ""}, ${toStr(err.val) || ""}'`
              : err.message;
      error(`${errMsg} [eval]`);
    }
  });

  const read = line => {
    try {
      reader.read(line.concat('\n'));
      reader.end();
    } catch (err) {
      error(`${err.message}`);
      reader.reset();
    }

    return reader.status();
  };

  return {
    id,
    read,
    readerStatus: reader.status,
    reset: reader.reset,
  };
};


module.exports = { REP };