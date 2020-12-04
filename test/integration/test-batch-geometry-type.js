'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const Capabilities = require('../../lib/const/capabilities');

describe('batch geometry type', () => {
  let supportBulk;
  before(function () {
    supportBulk = (Conf.baseConfig.bulk === undefined ? true : Conf.baseConfig.bulk)
      ? (shareConn.info.serverCapabilities & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) > 0
      : false;
  });

  it('Point format', async function () {
    if (!shareConn.info.isMariaDB()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS gis_point_batch');
    await shareConn.query('CREATE TABLE gis_point_batch  (g POINT)');
    await shareConn.query('FLUSH TABLES');
    await shareConn.beginTransaction();
    await shareConn.batch('INSERT INTO gis_point_batch VALUES (?)', [
      [
        {
          type: 'Point',
          coordinates: [10, 10]
        }
      ],
      [
        {
          type: 'Point',
          coordinates: [20, 10]
        }
      ],
      [
        {
          type: 'Point',
          coordinates: [20, 20]
        }
      ],
      [
        {
          type: 'Point',
          coordinates: [10, 20]
        }
      ],
      [
        {
          type: 'Point',
          coordinates: []
        }
      ],
      [
        {
          type: 'Point'
        }
      ]
    ]);
    const rows = await shareConn.query('SELECT * FROM gis_point_batch');
    assert.deepEqual(rows, [
      {
        g: {
          type: 'Point',
          coordinates: [10, 10]
        }
      },
      {
        g: {
          type: 'Point',
          coordinates: [20, 10]
        }
      },
      {
        g: {
          type: 'Point',
          coordinates: [20, 20]
        }
      },
      {
        g: {
          type: 'Point',
          coordinates: [10, 20]
        }
      },
      {
        g:
          shareConn.info.isMariaDB() &&
          shareConn.info.hasMinVersion(10, 5, 2) &&
          !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'Point' }
            : null
      },
      {
        g:
          shareConn.info.isMariaDB() &&
          shareConn.info.hasMinVersion(10, 5, 2) &&
          !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'Point' }
            : null
      }
    ]);
    shareConn.commit();
  });

  it('LineString insert', async function () {
    if (!shareConn.info.isMariaDB()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS gis_line_batch');
    await shareConn.query('CREATE TABLE gis_line_batch (g LINESTRING)');
    await shareConn.query('FLUSH TABLES');
    await shareConn.beginTransaction();
    await shareConn.batch('INSERT INTO gis_line_batch VALUES (?)', [
      [
        {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [0, 10],
            [10, 0]
          ]
        }
      ],
      [
        {
          type: 'LineString',
          coordinates: [[0, 10]]
        }
      ],
      [
        {
          type: 'LineString',
          coordinates: []
        }
      ],
      [
        {
          type: 'LineString'
        }
      ]
    ]);
    const rows = await shareConn.query('SELECT * FROM gis_line_batch');
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [0, 10],
              [10, 0]
            ]
          }
        },
        {
          g: {
            type: 'LineString',
            coordinates: [[0, 10]]
          }
        },
        {
          g: supportBulk
            ? {
                coordinates: [],
                type: 'LineString'
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'LineString' }
            : null
        },
        {
          g:
            shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
              ? { type: 'LineString' }
              : null
        }
      ]);
    } else {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [0, 10],
              [10, 0]
            ]
          }
        },
        {
          g: {
            type: 'LineString',
            coordinates: [[0, 10]]
          }
        },
        {
          g: null
        },
        {
          g: null
        }
      ]);
    }
    shareConn.commit();
  });

  it('Polygon insert', async function () {
    if (!shareConn.info.isMariaDB()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS gis_polygon_batch');
    await shareConn.query('CREATE TABLE gis_polygon_batch (g POLYGON)');
    await shareConn.query('FLUSH TABLES');
    await shareConn.beginTransaction();
    await shareConn.batch('INSERT INTO gis_polygon_batch VALUES (?)', [
      [
        {
          type: 'Polygon',
          coordinates: [
            [
              [10, 10],
              [20, 10],
              [20, 20],
              [10, 20],
              [10, 10]
            ]
          ]
        }
      ],
      [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [50, 0],
              [50, 50],
              [0, 50],
              [0, 0]
            ],
            [
              [10, 10],
              [20, 10],
              [20, 20],
              [10, 20],
              [10, 10]
            ]
          ]
        }
      ],
      [
        {
          type: 'Polygon',
          coordinates: [
            [[0, 0], [50]],
            [
              [10, 10],
              [20, 10]
            ]
          ]
        }
      ],
      [
        {
          type: 'Polygon',
          coordinates: []
        }
      ],
      [
        {
          type: 'Polygon'
        }
      ]
    ]);
    const rows = await shareConn.query('SELECT * FROM gis_polygon_batch');
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'Polygon',
            coordinates: [
              [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
                [10, 10]
              ]
            ]
          }
        },
        {
          g: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [50, 0],
                [50, 50],
                [0, 50],
                [0, 0]
              ],
              [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
                [10, 10]
              ]
            ]
          }
        },
        {
          g:
            shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
              ? { type: 'Polygon' }
              : null
        },
        {
          g: supportBulk
            ? {
                type: 'Polygon',
                coordinates: []
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'Polygon' }
            : null
        },
        {
          g:
            shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
              ? { type: 'Polygon' }
              : null
        }
      ]);
    } else {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'Polygon',
            coordinates: [
              [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
                [10, 10]
              ]
            ]
          }
        },
        {
          g: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [50, 0],
                [50, 50],
                [0, 50],
                [0, 0]
              ],
              [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
                [10, 10]
              ]
            ]
          }
        },
        {
          g: null
        },
        {
          g: null
        },
        {
          g: null
        }
      ]);
    }
    shareConn.commit();
  });

  it('MultiPoint insert', async function () {
    if (!shareConn.info.isMariaDB()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS gis_multi_point_batch');
    await shareConn.query('CREATE TABLE gis_multi_point_batch (g MULTIPOINT)');
    await shareConn.query('FLUSH TABLES');
    await shareConn.beginTransaction();
    await shareConn.batch('INSERT INTO gis_multi_point_batch VALUES (?)', [
      [
        {
          type: 'MultiPoint',
          coordinates: [
            [30, 30],
            [10, 10],
            [10, 20],
            [20, 20]
          ]
        }
      ],
      [{ type: 'MultiPoint', coordinates: [[10, 0]] }],
      [{ type: 'MultiPoint', coordinates: [] }],
      [{ type: 'MultiPoint' }]
    ]);
    const rows = await shareConn.query('SELECT * FROM gis_multi_point_batch');
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'MultiPoint',
            coordinates: [
              [30, 30],
              [10, 10],
              [10, 20],
              [20, 20]
            ]
          }
        },
        {
          g: {
            type: 'MultiPoint',
            coordinates: [[10, 0]]
          }
        },
        {
          g: supportBulk
            ? {
                type: 'MultiPoint',
                coordinates: []
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiPoint' }
            : null
        },
        {
          g: supportBulk
            ? {
                type: 'MultiPoint',
                coordinates: []
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiPoint' }
            : null
        }
      ]);
    } else {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'MultiPoint',
            coordinates: [
              [30, 30],
              [10, 10],
              [10, 20],
              [20, 20]
            ]
          }
        },
        {
          g: {
            type: 'MultiPoint',
            coordinates: [[10, 0]]
          }
        },
        {
          g: null
        },
        {
          g: null
        }
      ]);
    }
    shareConn.commit();
  });

  it('Multi-line insert', async function () {
    if (!shareConn.info.isMariaDB()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS gis_multi_line_batch');
    await shareConn.query('CREATE TABLE gis_multi_line_batch (g MULTILINESTRING)');
    await shareConn.query('FLUSH TABLES');
    await shareConn.beginTransaction();
    await shareConn.batch('INSERT INTO gis_multi_line_batch VALUES (?)', [
      [
        {
          type: 'MultiLineString',
          coordinates: [
            [
              [10, 48],
              [10, 21],
              [10, 0]
            ],
            [
              [16, 0],
              [16, 23],
              [16, 48]
            ]
          ]
        }
      ],
      [
        {
          type: 'MultiLineString',
          coordinates: [
            [
              [10, 48],
              [10, 21],
              [10, 0]
            ]
          ]
        }
      ],
      [{ type: 'MultiLineString', coordinates: [[]] }],
      [{ type: 'MultiLineString', coordinates: [] }],
      [{ type: 'MultiLineString' }]
    ]);
    const rows = await shareConn.query('SELECT * FROM gis_multi_line_batch');
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'MultiLineString',
            coordinates: [
              [
                [10, 48],
                [10, 21],
                [10, 0]
              ],
              [
                [16, 0],
                [16, 23],
                [16, 48]
              ]
            ]
          }
        },
        {
          g: {
            type: 'MultiLineString',
            coordinates: [
              [
                [10, 48],
                [10, 21],
                [10, 0]
              ]
            ]
          }
        },
        {
          g: supportBulk
            ? {
                type: 'MultiLineString',
                coordinates: [[]]
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiLineString' }
            : null
        },
        {
          g: supportBulk
            ? {
                type: 'MultiLineString',
                coordinates: []
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiLineString' }
            : null
        },
        {
          g: supportBulk
            ? {
                type: 'MultiLineString',
                coordinates: []
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiLineString' }
            : null
        }
      ]);
    } else {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'MultiLineString',
            coordinates: [
              [
                [10, 48],
                [10, 21],
                [10, 0]
              ],
              [
                [16, 0],
                [16, 23],
                [16, 48]
              ]
            ]
          }
        },
        {
          g: {
            type: 'MultiLineString',
            coordinates: [
              [
                [10, 48],
                [10, 21],
                [10, 0]
              ]
            ]
          }
        },
        {
          g: null
        },
        {
          g: null
        },
        {
          g: null
        }
      ]);
    }
    shareConn.commit();
  });

  it('Multi-polygon insert', async function () {
    if (!shareConn.info.isMariaDB()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS gis_multi_polygon_batch');
    await shareConn.query('CREATE TABLE gis_multi_polygon_batch (g MULTIPOLYGON)');
    await shareConn.query('FLUSH TABLES');
    await shareConn.beginTransaction();
    await shareConn.batch('INSERT INTO gis_multi_polygon_batch VALUES (?)', [
      [
        {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [28, 26],
                [28, 0],
                [84, 0],
                [84, 42],
                [28, 26]
              ],
              [
                [52, 18],
                [66, 23],
                [73, 9],
                [48, 6],
                [52, 18]
              ]
            ],
            [
              [
                [59, 18],
                [67, 18],
                [67, 13],
                [59, 13],
                [59, 18]
              ]
            ]
          ]
        }
      ],
      [
        {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [28, 26],
                [28, 0],
                [84, 0],
                [84, 42],
                [28, 26]
              ],
              [
                [52, 18],
                [66, 23],
                [73, 9],
                [48, 6],
                [52, 18]
              ]
            ]
          ]
        }
      ],
      [
        {
          type: 'MultiPolygon',
          coordinates: [[[]]]
        }
      ],
      [
        {
          type: 'MultiPolygon',
          coordinates: [[]]
        }
      ],
      [
        {
          type: 'MultiPolygon',
          coordinates: []
        }
      ],
      [
        {
          type: 'MultiPolygon'
        }
      ]
    ]);
    const rows = await shareConn.query('SELECT * FROM gis_multi_polygon_batch');
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [28, 26],
                  [28, 0],
                  [84, 0],
                  [84, 42],
                  [28, 26]
                ],
                [
                  [52, 18],
                  [66, 23],
                  [73, 9],
                  [48, 6],
                  [52, 18]
                ]
              ],
              [
                [
                  [59, 18],
                  [67, 18],
                  [67, 13],
                  [59, 13],
                  [59, 18]
                ]
              ]
            ]
          }
        },
        {
          g: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [28, 26],
                  [28, 0],
                  [84, 0],
                  [84, 42],
                  [28, 26]
                ],
                [
                  [52, 18],
                  [66, 23],
                  [73, 9],
                  [48, 6],
                  [52, 18]
                ]
              ]
            ]
          }
        },
        {
          g: supportBulk
            ? {
                type: 'MultiPolygon',
                coordinates: [[[]]]
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiPolygon' }
            : null
        },
        {
          g: supportBulk
            ? {
                type: 'MultiPolygon',
                coordinates: [[]]
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiPolygon' }
            : null
        },
        {
          g: supportBulk
            ? {
                type: 'MultiPolygon',
                coordinates: []
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiPolygon' }
            : null
        },
        {
          g: supportBulk
            ? {
                type: 'MultiPolygon',
                coordinates: []
              }
            : shareConn.info.hasMinVersion(10, 5, 2) && !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'MultiPolygon' }
            : null
        }
      ]);
    } else {
      assert.deepEqual(rows, [
        {
          g: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [28, 26],
                  [28, 0],
                  [84, 0],
                  [84, 42],
                  [28, 26]
                ],
                [
                  [52, 18],
                  [66, 23],
                  [73, 9],
                  [48, 6],
                  [52, 18]
                ]
              ],
              [
                [
                  [59, 18],
                  [67, 18],
                  [67, 13],
                  [59, 13],
                  [59, 18]
                ]
              ]
            ]
          }
        },
        {
          g: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [28, 26],
                  [28, 0],
                  [84, 0],
                  [84, 42],
                  [28, 26]
                ],
                [
                  [52, 18],
                  [66, 23],
                  [73, 9],
                  [48, 6],
                  [52, 18]
                ]
              ]
            ]
          }
        },
        {
          g: null
        },
        {
          g: null
        },
        {
          g: null
        },
        {
          g: null
        }
      ]);
    }
    shareConn.commit();
  });

  it('Geometry collection insert', async function () {
    if (!shareConn.info.isMariaDB()) this.skip();

    const conn = await base.createConnection();
    conn.query('DROP TABLE IF EXISTS gis_geometrycollection_batch');
    conn.query('CREATE TABLE gis_geometrycollection_batch (g GEOMETRYCOLLECTION)');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    await conn.batch('INSERT INTO gis_geometrycollection_batch VALUES (?)', [
      [
        {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Point',
              coordinates: [10, 10]
            },
            {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [0, 10],
                [10, 0]
              ]
            },
            {
              type: 'MultiPoint',
              coordinates: [
                [0, 0],
                [10, 10],
                [10, 20],
                [20, 20]
              ]
            },
            {
              type: 'MultiLineString',
              coordinates: [
                [
                  [10, 48],
                  [10, 21],
                  [10, 0]
                ],
                [
                  [16, 0],
                  [16, 23],
                  [16, 48]
                ]
              ]
            },
            {
              type: 'MultiPolygon',
              coordinates: [
                [
                  [
                    [28, 26],
                    [28, 0],
                    [84, 0],
                    [84, 42],
                    [28, 26]
                  ],
                  [
                    [52, 18],
                    [66, 23],
                    [73, 9],
                    [48, 6],
                    [52, 18]
                  ]
                ],
                [
                  [
                    [59, 18],
                    [67, 18],
                    [67, 13],
                    [59, 13],
                    [59, 18]
                  ]
                ]
              ]
            }
          ]
        }
      ],
      [
        {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Point',
              coordinates: [10, 20]
            }
          ]
        }
      ],
      [
        {
          type: 'GeometryCollection',
          geometries: [{}]
        }
      ],
      [
        {
          type: 'GeometryCollection',
          geometries: []
        }
      ],
      [
        {
          type: 'GeometryCollection'
        }
      ]
    ]);
    const rows = await conn.query('SELECT * FROM gis_geometrycollection_batch');
    assert.deepEqual(rows, [
      {
        g: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Point',
              coordinates: [10, 10]
            },
            {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [0, 10],
                [10, 0]
              ]
            },
            {
              type: 'MultiPoint',
              coordinates: [
                [0, 0],
                [10, 10],
                [10, 20],
                [20, 20]
              ]
            },
            {
              type: 'MultiLineString',
              coordinates: [
                [
                  [10, 48],
                  [10, 21],
                  [10, 0]
                ],
                [
                  [16, 0],
                  [16, 23],
                  [16, 48]
                ]
              ]
            },
            {
              type: 'MultiPolygon',
              coordinates: [
                [
                  [
                    [28, 26],
                    [28, 0],
                    [84, 0],
                    [84, 42],
                    [28, 26]
                  ],
                  [
                    [52, 18],
                    [66, 23],
                    [73, 9],
                    [48, 6],
                    [52, 18]
                  ]
                ],
                [
                  [
                    [59, 18],
                    [67, 18],
                    [67, 13],
                    [59, 13],
                    [59, 18]
                  ]
                ]
              ]
            }
          ]
        }
      },
      {
        g: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Point',
              coordinates: [10, 20]
            }
          ]
        }
      },
      {
        g: {
          type: 'GeometryCollection',
          geometries: []
        }
      },
      {
        g: {
          type: 'GeometryCollection',
          geometries: []
        }
      },
      {
        g: {
          type: 'GeometryCollection',
          geometries: []
        }
      }
    ]);
    conn.end();
  });
});
