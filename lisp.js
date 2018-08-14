const readline = require('readline');
const { List } = require('./eval');
const { REP } = require('./REP');

const Alias = {
  '!x': '(exit)',
  '!!': '(exit)',
  '!q': '(end)',
};

const PROMPT = () => `[${activeREP.id}]:> `;

const print = text => process.stdout.write(text);

const initEnv = {
  'lst': List([1, 2, 3]),
  'double': { proc: args => 2 * args[0] },
  'rep-select': { proc: args => selectREP(args[0])},
  'rep-list': { proc: () => List(Object.keys(REPs)) },
  'rep-end': { proc: args => endREP(args[0]) },
  'exit': { proc: args => process.exit(args[0]) },
  'print': { proc: args => { print(args.join(' ') + '\n') }},
};


const REPs = {};

let activeREP;

const selectREP = id => {
  activeREP = REPs[id];
  if (!activeREP) {
    activeREP = REP(id, initEnv, print);
    REPs[id] = activeREP;
  }
  return id;
};

const endREP = (id = activeREP.id) => {
  if (!REPs[id]) throw new Error(`${id} is not here`);

  delete REPs[id];
  if (id === activeREP.id) {
    activeREP = REPs[Object.keys(REPs)[0]];
    if (!activeREP) process.exit(0);
  }
  return id;
};


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', line => {
  if (Alias[line] && activeREP.readerStatus().state === 'ready') {
    print(PROMPT());
    rl.write(Alias[line] + '\n');
  } else {
    const { depth } = activeREP.read(line);
    const prompt
      = depth > 0
          ? `${' .'.repeat(depth)}${' '.repeat((PROMPT().length) + (depth*2))}`
          : `${PROMPT()}`;
    rl.setPrompt(prompt);
    rl.prompt();
  }
});

rl.on('SIGINT', () => {
  if (activeREP.readerStatus().state === 'ready') {
    process.exit(0);
  } else {
    print('*Break*\n');
    activeREP.reset();
    rl.write('\n');
  }
});


selectREP('1');
rl.write('\n');
