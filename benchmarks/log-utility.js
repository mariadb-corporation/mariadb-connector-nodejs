'use strict';

const pjson = require('../package-lock.json');
const chalk = require('chalk');
const defaultImgJson = {
  type: 'horizontalBar',
  data: {
    datasets: [
      {
        label: 'mysql 2.18.1',
        backgroundColor: '#db4437',
        data: [320]
      },
      {
        label: 'mysql2 2.2.5',
        backgroundColor: '#4285f4',
        data: [450]
      },
      {
        label: 'mariadb 3.0.1',
        backgroundColor: '#ff9900',
        data: [660]
      }
    ]
  },
  options: {
    plugins: {
      datalabels: {
        anchor: 'end',
        align: 'start',
        color: '#fff',
        font: {
          weight: 'bold'
        }
      }
    },
    elements: {
      rectangle: {
        borderWidth: 0
      }
    },
    responsive: true,
    legend: {
      position: 'right'
    },
    title: {
      display: true,
      text: 'Select * from mysql user limit 1'
    },
    scales: {
      xAxes: [
        {
          display: true,
          scaleLabel: {
            display: true,
            labelString: 'operations per second'
          },
          ticks: {
            beginAtZero: true
          }
        }
      ]
    }
  }
};

const getVersion = function (pjson, drv) {
  if (pjson.packages && pjson.packages['node_modules/' + drv]) {
    return pjson.packages['node_modules/' + drv].version;
  }
  if (pjson.dependencies && pjson.dependencies[drv]) {
    return pjson.dependencies[drv].version;
  }
  return null;
};

const getImg = (data) => {
  const pjson = require('../package-lock.json');
  const mysql2Version = getVersion(pjson, 'mysql2');
  const mysqlVersion = getVersion(pjson, 'mysql');
  const mariadbVersion = pjson.packages
    ? pjson.packages['']
      ? pjson.packages[''].version
      : pjson.version
    : pjson.version;

  //clone
  const resJson = JSON.parse(JSON.stringify(defaultImgJson));

  if (data.mysql) {
    resJson.data.datasets[0].label = 'mysql ' + mysqlVersion;
    resJson.data.datasets[0].data = [Math.round(data.mysql)];
  }

  if (data.mysql2) {
    resJson.data.datasets[1].label = 'mysql2 ' + mysql2Version;
    resJson.data.datasets[1].data = [Math.round(data.mysql2)];
  }

  resJson.data.datasets[2].label = 'mariadb ' + mariadbVersion;
  resJson.data.datasets[2].data = [Math.round(data.mariadb)];
  if (data.mysql2 && data.mysql) {
    return encodeURI(
      `https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=${Math.round(
        data.mysql
      )}&data2=${Math.round(data.mysql2)}&data3=${Math.round(data.mariadb)}&title=${data.title}`
    );
  }

  if (!data.mysql2) resJson.data.datasets.splice(1, 1);
  if (!data.mysql) resJson.data.datasets.splice(0, 1);
  resJson.options.title.text = data.title;

  return encodeURI('https://quickchart.io/chart?devicePixelRatio=1.0&h=160&w=520&c=' + JSON.stringify(resJson));
};

//************************************************
// display results
//************************************************
module.exports.displayReport = function (data, title, displaySql) {
  const simpleFormat = new Intl.NumberFormat('en-EN', {
    maximumFractionDigits: 1
  });
  const simpleFormatPerc = new Intl.NumberFormat('en-EN', {
    maximumFractionDigits: 2
  });

  let base = 0;
  let base2 = 0;
  let best = 0;

  for (let j = 0; j < data.length; j++) {
    let o = data[j];
    if (o.type === 'mysql') {
      base = o.iteration;
    }
    if (o.type === 'mysql2') {
      base2 = o.iteration;
    }
    if (o.iteration > best) {
      best = o.iteration;
    }
  }
  if (base === 0) {
    base = base2;
  }
  //display results

  // log image comparison link
  const res = { title: title + ' - ' + displaySql };
  for (let j = 0; j < data.length; j++) {
    res[data[j].type] = data[j].iteration;
  }
  console.log('    => ' + getImg(res));

  for (let j = 0; j < data.length; j++) {
    let o = data[j];
    const val = (100 * (o.iteration - base)) / base;
    let percText = '';
    if (o.iteration !== base) {
      percText = ` ( ${fillBlank((val > 0 ? '+' : '') + simpleFormat.format(val), 6, false)}% )`;
    }
    const tt = ` ${fillBlank(o.type, 16)} : ${fillBlank(simpleFormat.format(o.iteration), 8, false)} ops/s ±${fillBlank(
      simpleFormat.format(o.variation),
      4,
      false
    )}% ${percText}`;
    if (o.type.includes('mariadb')) {
      if (o.iteration < best) {
        console.log(chalk.red(tt));
      } else {
        console.log(chalk.green(tt));
      }
    } else {
      console.log(tt);
    }
  }
  console.log('');
};

const fillBlank = function (val, length, right) {
  if (right) {
    while (val.length < length) {
      val += ' ';
    }
  } else {
    while (val.length < length) {
      val = ' ' + val;
    }
  }
  return val;
};
