/* IndexedDB - the walkthrough's points, photographs included.
 *
 * Photos live on the record as an array of Blobs rather than in a store of
 * their own. A point carries at most three, so a record is around 1 MB, and
 * keeping them together means deleting a point can never leave an orphaned
 * photograph behind.
 *
 * Two separate marks are kept, and they mean different things:
 *
 *   sentAt      the photos and caption went to the WhatsApp group
 *   exportedAt  this point was included in a spreadsheet
 *
 * They are not the same event and one does not imply the other — a point can
 * be sent to the group in the morning and only reach a spreadsheet at the end
 * of the week. Collapsing them into one flag would mean either re-sending
 * WhatsApp messages or silently dropping rows from the Excel.
 */

(function (WT) {
  var DB_NAME = 'wt-surveillance';
  var DB_VERSION = 1;
  var RECORDS = 'records';
  var PREFS = 'prefs';

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(RECORDS)) {
          var store = db.createObjectStore(RECORDS, { keyPath: 'id', autoIncrement: true });
          store.createIndex('byDate', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains(PREFS)) {
          db.createObjectStore(PREFS, { keyPath: 'key' });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
      /* Without this the promise simply never settles, and every screen that
         waits on the database waits forever — which on a phone looks like an
         app that failed to start, with nothing to report. Rare, but the one
         case where silence is the worst possible answer. */
      request.onblocked = function () {
        reject(new Error('Database is blocked by another open copy of the app'));
      };
    });
    return dbPromise;
  }

  function tx(storeName, mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(storeName, mode);
        var store = transaction.objectStore(storeName);
        var result;
        // Resolve on the transaction completing, not on the request succeeding:
        // a write is only durable once the transaction commits.
        transaction.oncomplete = function () { resolve(result); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error); };
        result = work(store, function (value) { result = value; });
      });
    });
  }

  function requestValue(request, set) {
    request.onsuccess = function () { set(request.result); };
    return undefined;
  }

  /** Stamps a set of records on one field, leaving an existing stamp alone. */
  function stamp(ids, field, when) {
    return tx(RECORDS, 'readwrite', function (store) {
      ids.forEach(function (id) {
        var request = store.get(id);
        request.onsuccess = function () {
          var record = request.result;
          if (record && !record[field]) {
            record[field] = when;
            store.put(record);
          }
        };
      });
    });
  }

  WT.db = {

    /** Adds a point and returns it with the assigned id. */
    add: function (record) {
      return tx(RECORDS, 'readwrite', function (store, set) {
        var request = store.add(record);
        request.onsuccess = function () {
          record.id = request.result;
          set(record);
        };
      });
    },

    put: function (record) {
      return tx(RECORDS, 'readwrite', function (store, set) {
        return requestValue(store.put(record), set);
      });
    },

    get: function (id) {
      return tx(RECORDS, 'readonly', function (store, set) {
        return requestValue(store.get(id), set);
      });
    },

    remove: function (id) {
      return tx(RECORDS, 'readwrite', function (store, set) {
        return requestValue(store.delete(id), set);
      });
    },

    removeMany: function (ids) {
      return tx(RECORDS, 'readwrite', function (store) {
        ids.forEach(function (id) { store.delete(id); });
      });
    },

    /** Every point, oldest first — the order they were surveyed in. */
    all: function () {
      return tx(RECORDS, 'readonly', function (store, set) {
        var request = store.getAll();
        request.onsuccess = function () {
          set(request.result.sort(function (a, b) { return a.id - b.id; }));
        };
      });
    },

    /**
     * Records the moment a point's photos went to the group.
     *
     * A mark, never a delete: a share sheet closing is not proof that WhatsApp
     * delivered anything, so the photographs stay on the phone until the
     * operator says otherwise.
     */
    markSent: function (ids, when) { return stamp(ids, 'sentAt', when); },

    /** Records that these points were included in a spreadsheet. */
    markExported: function (ids, when) { return stamp(ids, 'exportedAt', when); },

    getPref: function (key, fallback) {
      return tx(PREFS, 'readonly', function (store, set) {
        var request = store.get(key);
        request.onsuccess = function () {
          set(request.result ? request.result.value : fallback);
        };
      });
    },

    setPref: function (key, value) {
      return tx(PREFS, 'readwrite', function (store, set) {
        return requestValue(store.put({ key: key, value: value }), set);
      });
    }
  };
}(window.WT));
