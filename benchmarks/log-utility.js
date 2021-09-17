'use strict';

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

module.exports.getImg = (data) => {
  const pjson = require('../package-lock.json');
  const mysql2Version = pjson.packages['node_modules/mysql2'] ? pjson.packages['node_modules/mysql2'].version : null;
  const mysqlVersion = pjson.packages['node_modules/mysql'] ? pjson.packages['node_modules/mysql'].version : null;
  const mariadbVersion = pjson.packages[''] ? pjson.packages[''].version : null;

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
    return (
      'https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=' +
      Math.round(data.mysql) +
      '&data2=' +
      Math.round(data.mysql2) +
      '&data3=' +
      Math.round(data.mariadb) +
      '&title=' +
      encodeURIComponent(data.title)
    );
  }

  if (!data.mysql2) resJson.data.datasets.splice(1, 1);
  if (!data.mysql) resJson.data.datasets.splice(0, 1);
  resJson.options.title.text = data.title;

  return (
    'https://quickchart.io/chart?devicePixelRatio=1.0&h=160&w=520&c=' + encodeURIComponent(JSON.stringify(resJson))
  );
};
