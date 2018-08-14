
const History = histLength => {
  const hist = [];

  return {
    hist,
    add: val => {
      while (hist.length >= histLength) hist.pop();
      hist.unshift(val);
    },
  };
};


const pushUnique = (val, array) => array.indexOf(val) >= 0 ? false : array.push(val);


module.exports = { History, pushUnique };
