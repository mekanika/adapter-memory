
/**
  Universal Module exporter (supports CommonJS)
*/

(function (name, root, factory) {

  if ('function' === typeof define && define.amd) define( factory );
  else if ('undefined' !== typeof module && module.exports) module.exports = factory();
  else root[ name ] = factory();

})('adapterMemory', this, function () {


  /**
    The core module
  */

  var memory = {};


  /**
    Internal data storage
    Available as `memory._store` for manual override
  */

  memory._store = {};


  /**
    Primary adapter

    @param {Query} query
    @param {Function} cb Callback passed (error, results)

    @public
  */

  memory.exec = function( query, cb ) {
    // console.log('Memory:', query.toObject ? query.toObject() : query );

    if (!cb) throw new Error('Missing callback');

    if (!query.do || !query.on)
      return cb('Invalid query: must provide `action` and `resource`');

    if (memory[ query.do ]) return memory[ query.do ]( query, cb );
    else cb && cb( 'No matching action' );
  };


  /**
    Helper: finds a record from table `resource` by `id`

    @param {String} resource
    @param {String} id

    @private
  */

  function _find( resource, ids ) {
    var _ret = [];

    if (!(ids instanceof Array)) ids = [ids];

    ids.forEach( function (id) {
      memory._store[ resource ].forEach( function (rec, i) {
        if (rec.id === id) _ret.push({index:i, record:rec});
      });
    });

    return _ret;
  }


  /**
    Helper: Cheap/nasty async checker
    Setup a count, have your code decrement the count when passing to chkdone
  */

  function _chkdone (count, cb, res) {
    if (count === 0) cb( null, res );
  };


  /**
    Helper: Grabs the lastKey from an object. Or first key if only one key.
    10x faster than Object.keys. I know. Who cares in this adapter.
    http://jsperf.com/unknown-object-key
  */

  function _lastkey (block) {
    var ret;
    for (var key in block) ret = key;
    return ret;
  }


  /**
    Helper: Squashes a collection of objs to an array of values keyed on 'key'
  */

  function _squash (objs, key) {
    var ret = [];
    objs.forEach( function (o) {
      ret.push(o[key]);
    });
    return ret;
  }


  /**
    Helper: Whitelist/blacklist fields in elements 'res'
    Ugly/slow/nasty
  */

  function _select (res, sel) {
    if (!sel) return res;

    res.forEach( function (r) {
      var keys = Object.keys(r);
      var remove = [];

      sel.forEach( function (s,i) {
        if (s[0] === '-') remove[i] = s.slice(1);
      });

      if (remove.length) remove.forEach( function (s) { delete r[s]; });
      else keys.forEach( function (k) {
        if ( sel.indexOf(k) < 0 ) delete r[k];
      });
    });
    return res;
  }



  /**
    Creates new record/s

    @param {Qe} qe
    @param {Function} cb

    @private
  */

  memory.create = function( qe, cb ) {
    var created = [];

    var insert = function (record) {
      if (record.id) throw new Error('Fuck you, id exists');
        // Generate ID
      var id = Math.random().toString(36).substr(2);
      record.id = id;

      if (!memory._store[ qe.on ]) memory._store[ qe.on ] = [];
      memory._store[ qe.on ].push( record );
      created.push( record );
    };

    qe.body.forEach( insert );

    if (cb) cb( null, created.length > 1 ? created : created[0] );
  };


  /**
    Update (partial) a record/s

    @param {QueryObject} qe
    @param {Function} cb

    @private
  */

  memory.update = function( qe, cb ) {

    if (!qe.ids || !qe.ids.length)
      return cb('Must provide ids to update in Query .ids field');

    var found = _find( qe.on, qe.ids );
    // @todo Is "not found" supposed to return in this error channel?
    if (!found) return cb('Record not found to update');


    var db = memory._store[ qe.on ];

    found.forEach( function (res) {

      var dbrec = db[ res.index ];

      // Apply provided body updates (ie. partial update, no delete)
      if (qe.body) {
        for (var key in qe.body[0]) {
          dbrec[ key ] = qe.body[0][ key ];
        }
      }

    });


    return cb( null, _squash(found, 'record') );
  };


  /**
    Deletes a record/s
  */

  memory.remove = function( qe, cb ) {

    if (!qe.ids || !qe.ids.length)
      return cb( 'Must provide ids to remove in Query .ids' );

    qe.ids.forEach( function(id) {
      var found = _find( qe.on, id );
      if (found) memory._store[ qe.on ].splice( found.index, 1 );
    });

    return cb( null, true );
  };


  /**
    Retrieve record/s

    @param {QueryObject} qe
    @param {Function} cb

    @private
  */

  memory.find = function( qe, cb ) {
    var found = [];

    // Specifically Get by IDs
    if (qe.ids) {
      _find( qe.on, qe.ids ).forEach( function (rec) {
        found.push( rec.record );
      })
    }
    // Otherwise: find MANY
    else if (memory._store[ qe.on ])
      found = memory._store[ qe.on ];

    // Clone the results so we're not destroying the DB
    // omfg this is nasty. Serious eye bleeding. Never production.
    found = JSON.parse( JSON.stringify(found) );

    // Offset
    if ('number' === typeof qe.offset ) found = found.slice(qe.offset);

    // Limit results
    if (qe.limit) found = found.slice(0, qe.limit);

    // Apply selection
    found = _select( found, qe.select );

    // Populate
    if (qe.populate) {
      // Cheap/nasty async: number of searches required
      var _as = found.length * Object.keys(qe.populate).length;

      Object.keys( qe.populate ).forEach( function (key) {
        var pop = qe.populate[ key ];

        // Ugh looking up every record is DUMB
        found.forEach( function (res) {
          if (pop.query) pop.query.ids = res[key];

          var nq = pop.query || {on:key, ids:res[key]};

          memory.find( nq, function (e,r) {
            if (e) return cb('Died: '+e);
            res[key] = r;
            _chkdone( --_as, cb, found );
          });
        });
      });
    }

    else return cb( null, found );


  };


  /**
    Export the module
  */

  return memory;

});
