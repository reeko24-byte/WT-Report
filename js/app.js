/* Walkthrough Surveillance — screen wiring.
 *
 * The order of work is the order the brief describes: say who is walking, say
 * where, then walk it — a KP at a time, three photographs each, one WhatsApp
 * report per KP. The spreadsheet is a separate button because it is a separate
 * job: one message per point all day, one file at the end of it.
 *
 * The crew and the assignment are asked once and then STAY. They are the same
 * from the first KP to the last, and re-picking them twenty times a day is how
 * a segment ends up wrong on half a day's records. They are shown on the survey
 * screen the whole time instead, with one link to change them.
 *
 * Photographs come last, not first, and the camera stays disabled until the KP
 * and the condition are set. Everything on the survey screen is burned into the
 * photograph's own pixels, so a photo taken before those fields would carry a
 * blank or wrong stamp — which is exactly the part nothing downstream can
 * correct.
 */

(function (WT) {

  var state = {
    crew: { team: '', reporter: '', mates: [] },
    area: { zone: '', segment: '', size: '', kpFrom: '', kpTo: '' },
    /* Once Size Pipe has been typed by hand it stops following the segment. A
       crew standing in front of the pipe can read its diameter; the table can
       only remember what it was told. */
    sizeTouched: false,

    gps: { state: 'waiting' },
    form: { condition: '', other: '', kp: '' },

    photos: [],          // { blob, thumb, width, height, signature, seal… }
    lastAddress: null,
    sending: null,       // the point currently on the send screen
    built: null,         // { blob, file, filename, ids } once Excel is made
    chosen: [],
    includeExported: false
  };

  /* Consecutive KPs sit close together and OpenStreetMap returns the same
     answer for both. Caching on a rounded fix (4 dp, about 11 m) turns a walk
     into a handful of lookups instead of one per photograph. */
  var addressCache = {};

  function $(id) { return document.getElementById(id); }

  var currentScreen = 'team';

  var XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function show(screenId) {
    currentScreen = screenId;
    ['team', 'area', 'form', 'send', 'list', 'export'].forEach(function (name) {
      $('screen-' + name).classList.toggle('active', name === screenId);
    });
    window.scrollTo(0, 0);
  }

  var toastTimer;
  function toast(message) {
    var element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove('show'); }, 2600);
  }

  /** A short, reportable description of a failure. */
  function describe(error) {
    if (!error) return 'unknown';
    var name = error.name || 'Error';
    return error.message ? name + ': ' + error.message : name;
  }

  function isAndroid() { return /Android/.test(navigator.userAgent); }

  /**
   * Whether this phone will refuse to share the spreadsheet, whatever we do.
   *
   * Chrome on Android only lets a web page share a file whose extension is on
   * its own allowlist — images, audio, video, text, csv, html, svg and pdf.
   * `.xlsx` is not on it, and nothing the page does changes that: the check
   * happens in the browser process, after the page has handed the file over.
   *
   * What makes it hard to recognise is that `navigator.canShare()` does *not*
   * consult that list. It answers yes, `share()` is then refused, and the
   * refusal arrives as `NotAllowedError: Permission denied` — the same error a
   * missing user gesture produces. Photographs share perfectly from the same
   * screen a moment earlier, because `.jpg` is on the list.
   *
   * So on Android the download is the real path and is presented as such,
   * rather than leaving an operator to tap a button that cannot work.
   */
  function fileShareLikelyBlocked() { return isAndroid(); }

  /* Whether a share() call is still waiting on the share sheet. Chrome refuses
     a second share while one is outstanding and reports it as NotAllowedError —
     the same error it gives for a missing user gesture, so without this flag the
     two are indistinguishable from the message alone. */
  var sharePending = false;

  /**
   * Hands a payload to the share sheet, from inside the tap that authorised it.
   *
   * Everything is decided before the tap — which payload, whether the browser
   * accepts it — so that the only thing standing between the tap and
   * navigator.share() is this function call. Anything else risks the browser
   * deciding the tap no longer counts, and it then refuses with NotAllowedError
   * whatever the real problem was.
   *
   * There is deliberately no retry: a second share() would run after a rejected
   * promise, outside the gesture, and fail on activation instead of on the
   * original cause.
   */
  function handToShareSheet(payload, statusId, envId, onShared) {
    if (sharePending) {
      $(statusId).textContent =
        'Share sheet sebelumnya belum tertutup. Tutup aplikasi sepenuhnya lalu buka lagi.';
      showEnvironment(envId);
      return;
    }
    sharePending = true;

    navigator.share(payload).then(function () {
      sharePending = false;
      onShared();
    }).catch(function (error) {
      sharePending = false;
      // A cancelled share must not mark anything: nothing left the phone.
      if (error && error.name === 'AbortError') return;
      $(statusId).textContent = shareFailureText(statusId, error);
      showEnvironment(envId);
    });
  }

  /** Names the cause when we can, rather than only quoting the error. */
  function shareFailureText(statusId, error) {
    if (statusId === 'export-status' && fileShareLikelyBlocked() &&
        error && error.name === 'NotAllowedError') {
      return 'Chrome di Android tidak mengizinkan file Excel dibagikan. ' +
        'Pakai Simpan ke Files, lalu WhatsApp › Lampirkan › Dokumen.';
    }
    return 'Gagal mengirim: ' + describe(error) + '. Salin caption lalu kirim manual.';
  }

  /* ── 1. Crew ────────────────────────────────────────────────────────── */

  function buildTeamChips() {
    var container = $('t-team');
    container.innerHTML = '';
    WT.OPTIONS.teams.forEach(function (team) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = team.label;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        if (state.crew.team === team.id) return;
        state.crew.team = team.id;
        /* A different team is a different crew, so the names go with it. Keeping
           them would leave a Bangko name filed under Duri and looking correct. */
        state.crew.reporter = '';
        state.crew.mates = [];

        // The team's own area, offered rather than imposed: a Duri crew sent
        // north picks North Area on the next screen and the app does not argue.
        // The assignment screen is redrawn with it, not left to catch up on its
        // own — it is not the screen showing, and a default that only appears
        // after some later redraw is a default nobody can rely on.
        if (!state.area.zone) { applyZone(team.zone); renderArea(); }

        renderCrew();
      });
      container.appendChild(chip);
    });
  }

  /** The roster, this team's members first — that is who is usually picked. */
  function rosterFor(teamId) {
    var mine = [];
    var rest = [];
    WT.OPTIONS.roster.forEach(function (person) {
      (person.team === teamId ? mine : rest).push(person);
    });
    return { mine: mine, rest: rest };
  }

  function renderCrew() {
    Array.prototype.forEach.call($('t-team').children, function (chip, index) {
      chip.setAttribute('aria-pressed',
        String(WT.OPTIONS.teams[index].id === state.crew.team));
    });

    renderReporter();
    renderMates();

    var ready = !!(state.crew.team && state.crew.reporter);
    $('t-continue').disabled = !ready;
    $('t-blocker').textContent = ready ? ''
      : (!state.crew.team ? 'Pilih team dulu.' : 'Pilih nama Anda.');
  }

  /**
   * The reporter list: this team, then everyone else.
   *
   * Everyone else is there because the roster does not cover every case — one
   * name on it carries no area at all, and the approved example report is filed
   * by a crew of two from different lines. A picker that could not express that
   * would be wrong about the very report it was built from.
   */
  function renderReporter() {
    var select = $('t-reporter');
    var previous = state.crew.reporter;
    select.innerHTML = '<option value="">— pilih nama —</option>';

    if (!state.crew.team) {
      select.disabled = true;
      return;
    }
    select.disabled = false;

    var split = rosterFor(state.crew.team);
    var team = WT.teamById(state.crew.team);

    function group(label, people) {
      if (!people.length) return;
      var optgroup = document.createElement('optgroup');
      optgroup.label = label;
      people.forEach(function (person) {
        var option = document.createElement('option');
        option.value = person.name;
        option.textContent = person.name;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    }

    group(team ? team.label : 'Team', split.mine);
    group('Roster lain', split.rest);

    select.value = previous;
    // The name may not exist in this team's list any more.
    if (select.value !== previous) state.crew.reporter = '';
  }

  $('t-reporter').addEventListener('change', function () {
    state.crew.reporter = this.value;
    // Never both the reporter and a team-mate: one tick, one person.
    state.crew.mates = state.crew.mates.filter(function (name) {
      return name !== state.crew.reporter;
    });
    renderCrew();
  });

  function renderMates() {
    var list = $('t-mates');
    list.innerHTML = '';

    $('t-mates-label').textContent = 'Anggota lain (' +
      state.crew.mates.length + ' dari ' + WT.OPTIONS.MAX_TEAM_MATES + ')';

    if (!state.crew.team) {
      var waiting = document.createElement('div');
      waiting.className = 'pick-head';
      waiting.textContent = 'Pilih team dulu';
      list.appendChild(waiting);
      return;
    }

    var split = rosterFor(state.crew.team);
    var team = WT.teamById(state.crew.team);
    var full = state.crew.mates.length >= WT.OPTIONS.MAX_TEAM_MATES;

    /* The reporter is already on the report; ticking them twice would print
       their name twice. Dropped here rather than inside the loop so that a
       section left with nobody in it gets no heading either — the South crew is
       one person, and when that person is the reporter a bare heading over an
       empty gap reads as a list that failed to load. */
    function others(people) {
      return people.filter(function (person) {
        return person.name !== state.crew.reporter;
      });
    }

    function heading(text) {
      var head = document.createElement('div');
      head.className = 'pick-head';
      head.textContent = text;
      list.appendChild(head);
    }

    function rows(people) {
      people.forEach(function (person) {
        var picked = state.crew.mates.indexOf(person.name) !== -1;
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'pick';
        row.setAttribute('aria-pressed', String(picked));
        // Disabled rather than hidden once the crew is full: the names stay
        // visible, and it is obvious why they cannot be added.
        row.disabled = full && !picked;

        var box = document.createElement('span');
        box.className = 'box';
        row.appendChild(box);

        var who = document.createElement('span');
        who.className = 'who-name';
        var name = document.createElement('b');
        name.textContent = person.name;
        var badge = document.createElement('span');
        badge.textContent = person.badge;
        who.appendChild(name);
        who.appendChild(badge);
        row.appendChild(who);

        row.addEventListener('click', function () {
          var at = state.crew.mates.indexOf(person.name);
          if (at === -1) {
            if (state.crew.mates.length >= WT.OPTIONS.MAX_TEAM_MATES) return;
            state.crew.mates.push(person.name);
          } else {
            state.crew.mates.splice(at, 1);
          }
          renderMates();
        });

        list.appendChild(row);
      });
    }

    var mine = others(split.mine);
    var rest = others(split.rest);

    if (mine.length) {
      heading(team ? team.label : 'Team');
      rows(mine);
    }
    if (rest.length) {
      heading('Roster lain');
      rows(rest);
    }
  }

  $('t-continue').addEventListener('click', function () {
    if (this.disabled) return;
    WT.db.setPref('crew', state.crew);
    renderAssignment();
    renderArea();
    show(state.area.segment ? 'form' : 'area');
    refreshCount();
  });

  $('change-team').addEventListener('click', function () {
    renderCrew();
    show('team');
  });

  /** "Ari Kurniawan +1" — who filed it, and how many walked with them. */
  function crewLabel() {
    var extra = state.crew.mates.length;
    return (state.crew.reporter || '—') + (extra ? ' +' + extra : '');
  }

  /** Every name on the report, reporter first. */
  function crewNames() { return WT.teamNames(state.crew); }

  /* ── 2. Assignment ──────────────────────────────────────────────────── */

  function buildZoneChips() {
    var container = $('a-zone');
    container.innerHTML = '';
    WT.OPTIONS.zones.forEach(function (zone) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = zone;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () { applyZone(zone); renderArea(); });
      container.appendChild(chip);
    });
  }

  /** Sets the zone and drops a segment that does not belong to it. */
  function applyZone(zone) {
    state.area.zone = zone;
    var segment = WT.segmentById(state.area.segment);
    if (!segment || segment.zone !== zone) {
      state.area.segment = '';
      state.area.size = '';
      // The stretch belongs to the segment it was set for. Carried across, it
      // would name real KPs on a line nobody is walking.
      state.area.kpFrom = '';
      state.area.kpTo = '';
      state.sizeTouched = false;
    }
  }

  function renderArea() {
    Array.prototype.forEach.call($('a-zone').children, function (chip, index) {
      chip.setAttribute('aria-pressed',
        String(WT.OPTIONS.zones[index] === state.area.zone));
    });

    var select = $('a-segment');
    select.innerHTML = '<option value="">— pilih segment —</option>';
    select.disabled = !state.area.zone;

    WT.segmentsInZone(state.area.zone).forEach(function (segment) {
      var option = document.createElement('option');
      option.value = segment.id;
      option.textContent = WT.segmentText(segment.id, segment.name);
      select.appendChild(option);
    });
    select.value = state.area.segment;

    $('a-kp-from').value = state.area.kpFrom;
    $('a-kp-to').value = state.area.kpTo;
    $('a-whole').disabled = !WT.segmentEndKp(state.area.segment);
    renderRangeHint();

    $('a-size').value = state.area.size;
    renderSizeHint();

    var rangeSet = WT.isKpComplete(state.area.kpFrom) &&
      WT.isKpComplete(state.area.kpTo);
    var ready = !!(state.area.zone && state.area.segment && rangeSet &&
      WT.parseSizes(state.area.size).length > 0);
    $('a-continue').disabled = !ready;
    $('a-blocker').textContent = ready ? ''
      : !state.area.zone ? 'Pilih Location dulu.'
      : !state.area.segment ? 'Pilih segment.'
      : !rangeSet ? 'Isi Penugasan — KP awal dan KP akhir.'
      : 'Isi Size Pipe.';
  }

  function renderRangeHint() {
    var end = WT.segmentEndKp(state.area.segment);
    var hint = $('a-range-hint');

    if (!state.area.segment) { hint.textContent = ''; return; }
    if (!end) {
      hint.textContent = 'Isi KP awal dan KP akhir yang ditugaskan hari ini.';
      return;
    }
    hint.textContent = 'Segment ' + state.area.segment + ' sepanjang ' +
      WT.kpPrint(end) + '. Isi bagian yang ditugaskan hari ini, atau tekan ' +
      'Seluruh segment.';
  }

  /* The "+" is inserted as you type, so the caret has to be forced back to the
     end — otherwise typing 0,0,0,0,0 gives 00+000 only by luck, and 1,0,0,0,0
     gives 10+000 while 0,7,6,0,0 gives 07+006 rather than 07+600. */
  function wireAssignedKp(inputId, key) {
    $(inputId).addEventListener('input', function () {
      var formatted = WT.formatKp(this.value);
      this.value = formatted;
      this.setSelectionRange(formatted.length, formatted.length);
      state.area[key] = formatted;
      renderArea();
    });
  }
  wireAssignedKp('a-kp-from', 'kpFrom');
  wireAssignedKp('a-kp-to', 'kpTo');

  /* The whole segment, from its start to its as-built end. By far the commonest
     assignment, and typing five digits twice for it is five digits twice too
     many. */
  $('a-whole').addEventListener('click', function () {
    var end = WT.segmentEndKp(state.area.segment);
    if (!end) return;
    state.area.kpFrom = '00+000';
    state.area.kpTo = end;
    renderArea();
  });

  function renderSizeHint() {
    var segment = WT.segmentById(state.area.segment);
    if (!segment) { $('a-size-hint').textContent = ''; return; }
    $('a-size-hint').textContent = state.sizeTouched
      ? 'Diisi manual. Kosongkan untuk kembali ke ukuran segment (' +
        WT.sizeText(segment.size) + ').'
      : 'Terisi otomatis dari Segment ' + segment.id + ' — ' +
        WT.sizeText(segment.size) + '. Bisa diubah.';
  }

  $('a-segment').addEventListener('change', function () {
    state.area.segment = this.value;
    var segment = WT.segmentById(this.value);
    // A hand-typed size belongs to the segment it was typed for, so picking a
    // different one hands the field back to the table.
    state.sizeTouched = false;
    state.area.size = segment ? WT.sizeInputText(segment.size) : '';
    renderArea();
  });

  $('a-size').addEventListener('input', function () {
    state.area.size = this.value;
    // Clearing the field hands control back to the segment, so there is a way
    // out of a manual value without starting over.
    state.sizeTouched = !!this.value.trim();
    if (!state.sizeTouched) {
      var segment = WT.segmentById(state.area.segment);
      state.area.size = segment ? WT.sizeInputText(segment.size) : '';
      this.value = state.area.size;
    }
    renderArea();
  });

  $('a-back').addEventListener('click', function () { renderCrew(); show('team'); });

  $('a-continue').addEventListener('click', function () {
    if (this.disabled) return;
    WT.db.setPref('area', state.area);
    renderAssignment();
    show('form');
    refreshCount();
  });

  $('change-area').addEventListener('click', function () { renderArea(); show('area'); });

  /** The strip that stays on screen for the whole walk. */
  function renderAssignment() {
    $('crew-label').textContent = crewLabel();

    var segment = WT.segmentById(state.area.segment);
    var line = $('assign-line');
    line.textContent = (state.area.zone || '—') + ' · Segment ' +
      (segment ? WT.segmentText(segment.id, segment.name) : '—');

    var stretch = WT.kpRangeText(state.area.kpFrom, state.area.kpTo);
    var detail = document.createElement('small');
    detail.textContent = (stretch ? stretch + ' · ' : '') +
      'Size Pipe ' + WT.sizeText(pipeSize()) +
      ' · Tim: ' + crewNames().join(', ');
    line.appendChild(detail);
  }

  function pipeSize() { return WT.parseSizes(state.area.size); }

  function segmentName() {
    var segment = WT.segmentById(state.area.segment);
    return segment ? segment.name : '';
  }

  /* ── 3. The survey form ─────────────────────────────────────────────── */

  function buildConditionChips() {
    var container = $('f-condition');
    container.innerHTML = '';
    WT.OPTIONS.conditions.forEach(function (condition) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = condition.label === WT.OPTIONS.CONDITION_OTHER
        ? 'Lainnya — tulis sendiri'
        : condition.label;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        state.form.condition = condition.label;
        syncCondition();
        updateReady();
      });
      container.appendChild(chip);
    });
  }

  function syncCondition() {
    Array.prototype.forEach.call($('f-condition').children, function (chip, index) {
      chip.setAttribute('aria-pressed',
        String(WT.OPTIONS.conditions[index].label === state.form.condition));
    });

    var other = state.form.condition === WT.OPTIONS.CONDITION_OTHER;
    $('other-field').classList.toggle('hidden', !other);
    renderNotePreview();
  }

  /**
   * The sentence that will actually be sent, under the choice that produced it.
   *
   * The chip says "Area ROW Terpantau Aman" and the report says a whole
   * sentence. Without this the operator taps one thing and sends another, and
   * only finds out on the send screen.
   */
  function renderNotePreview() {
    $('note-preview').textContent = noteText();
  }

  /** What goes on the report's Note line. */
  function noteText() {
    var condition = WT.conditionByLabel(state.form.condition);
    if (!condition) return '';
    return condition.label === WT.OPTIONS.CONDITION_OTHER
      ? state.form.other.trim()
      : condition.note;
  }

  /** What is stamped into the photograph — short enough to fit on one line. */
  function conditionStampText() {
    return state.form.condition === WT.OPTIONS.CONDITION_OTHER
      ? state.form.other.trim()
      : state.form.condition;
  }

  $('f-other').addEventListener('input', function () {
    state.form.other = this.value;
    renderNotePreview();
    updateReady();
  });

  /* The "+" is inserted as you type, so the caret has to be forced back to the
     end — otherwise typing 0,7,6,0,0 gives 07+006 rather than 07+600, a KP that
     is wrong but looks entirely valid. */
  $('f-kp').addEventListener('input', function () {
    var formatted = WT.formatKp(this.value);
    this.value = formatted;
    this.setSelectionRange(formatted.length, formatted.length);
    state.form.kp = formatted;
    updateReady();
  });

  /**
   * What a photograph needs before it can be taken.
   *
   * Only the fields that get burned into the stamp: a photo taken without them
   * carries a blank or wrong one, and the pixels cannot be corrected afterwards.
   */
  function missingForPhoto() {
    var missing = [];
    if (!WT.isKpComplete(state.form.kp)) missing.push('KP');
    if (!state.form.condition) missing.push('Note');
    if (state.form.condition === WT.OPTIONS.CONDITION_OTHER && !state.form.other.trim()) {
      missing.push('kondisi lain');
    }
    return missing;
  }

  function updateReady() {
    var taken = state.photos.length;
    var full = taken >= WT.OPTIONS.MAX_PHOTOS;
    var photoMissing = full ? [] : missingForPhoto();
    var canShoot = !full && photoMissing.length === 0;

    // Both ways of adding a photograph wait on the same fields, because both
    // produce the same burned-in stamp.
    $('take-photo').disabled = !canShoot;
    $('pick-gallery').disabled = !canShoot;
    $('photo-blocker').textContent = full
      ? 'Sudah ' + WT.OPTIONS.MAX_PHOTOS + ' foto. Hapus salah satu untuk mengganti.'
      : (photoMissing.length ? 'Isi dulu: ' + photoMissing.join(', ') + '.' : '');

    var missing = missingForPhoto();
    var short = WT.OPTIONS.MIN_PHOTOS - taken;
    $('save-point').disabled = missing.length > 0 || short > 0;

    $('save-blocker').textContent =
      missing.length ? 'Isi dulu: ' + missing.join(', ') + '.'
      : short > 0 ? 'Kurang ' + short + ' foto lagi (laporan WT butuh ' +
          WT.OPTIONS.MIN_PHOTOS + ').'
      : '';

    renderOutsideWarning();

    // Editing a field after the photos were taken is exactly when this needs to
    // be noticed, so it is checked here rather than only on capture.
    renderStaleWarning();
  }

  /**
   * Says when a KP falls outside the stretch the crew was assigned.
   *
   * A flag, never a refusal. The commonest cause is a typo — a KP two segments
   * long, entered a digit out — and catching those at the moment of typing is
   * most of the value. But the crew are the ones standing on the line: an
   * assignment gets extended, a crew gets waved onto the next stretch, and an
   * app that refused the record would simply lose it.
   */
  function renderOutsideWarning() {
    var warning = $('kp-outside');
    var inside = WT.kpWithin(state.form.kp, state.area.kpFrom, state.area.kpTo);

    warning.textContent = inside ? '' :
      'KP ini di luar penugasan (' +
      WT.kpRangeText(state.area.kpFrom, state.area.kpTo) +
      '). Tetap bisa disimpan — periksa dulu apakah salah ketik.';
    warning.classList.toggle('hidden', inside);
  }

  /* ── GPS ────────────────────────────────────────────────────────────── */

  function renderGps() {
    var panel = $('gps');
    var gps = state.gps;

    panel.className = 'gps ' +
      (gps.state === 'ok' ? 'ok' : gps.state === 'denied' ? 'denied' : 'waiting');

    if (gps.state === 'ok') {
      $('gps-status').textContent = 'GPS terkunci · ±' + Math.round(gps.accuracy) + ' m';
      $('gps-detail').textContent = gps.latitude.toFixed(6) + ', ' + gps.longitude.toFixed(6);
    } else {
      $('gps-status').textContent =
        gps.state === 'denied' ? 'Akses lokasi ditolak'
        : gps.state === 'unsupported' ? 'Perangkat ini tidak punya GPS'
        : 'Menunggu sinyal GPS…';
      $('gps-detail').textContent = gps.state === 'denied'
        ? 'Aktifkan lewat Pengaturan. Foto tetap bisa diambil, tanpa koordinat.'
        : 'Foto tetap bisa diambil — KP yang jadi acuan laporan.';
    }
  }

  /* ── Photographs ────────────────────────────────────────────────────── */

  /**
   * The values that end up burned into a photo.
   *
   * Kept with each photograph so the strip can point out that something was
   * changed after the picture was taken — the pixels cannot be corrected, and an
   * operator would otherwise have no way of knowing.
   */
  function overlaySignature() {
    return [state.area.zone, state.area.segment, WT.sizeText(pipeSize()), state.form.kp,
            conditionStampText(), crewNames().join('+')].join('|');
  }

  $('take-photo').addEventListener('click', function () {
    if (this.disabled) return;
    $('camera-input').click();
  });

  $('pick-gallery').addEventListener('click', function () {
    if (this.disabled) return;
    $('gallery-input').click();
  });

  /** The address for a fix — from cache, or looked up with a short deadline. */
  function addressFor(latitude, longitude) {
    var key = latitude.toFixed(4) + ',' + longitude.toFixed(4);
    if (addressCache[key]) return Promise.resolve(addressCache[key]);
    if (!navigator.onLine) return Promise.resolve(null);

    // Capped well below the network timeout: the operator is standing on the
    // ROW waiting for the photo, and a place name is the least important line.
    return Promise.race([
      WT.geo.reverse(latitude, longitude),
      new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 5000); })
    ]).then(function (address) {
      if (address) addressCache[key] = address;
      return address;
    });
  }

  $('camera-input').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';                       // so retaking the same shot re-fires
    if (!file) return;
    addPhotos([file], 'camera');
  });

  $('gallery-input').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    if (!files.length) return;
    addPhotos(files, 'gallery');
  });

  /**
   * Adds one or more photographs, one at a time.
   *
   * Sequential rather than parallel: each one decodes a full-size image onto a
   * canvas and hashes several megabytes, and three of those at once on a
   * mid-range phone is how a walk ends with a reloaded tab.
   */
  function addPhotos(files, source) {
    var room = WT.OPTIONS.MAX_PHOTOS - state.photos.length;
    if (room <= 0) return;

    var queue = files.slice(0, room);
    toast('Memproses foto…');

    queue.reduce(function (chain, file) {
      return chain.then(function () { return addOnePhoto(file, source); });
    }, Promise.resolve()).then(function () {
      renderPhotoStrip();
      updateReady();
      // Silently dropping the extras would look like the picker misfired.
      if (files.length > queue.length) {
        toast('Hanya ' + queue.length + ' foto yang muat.');
      }
    }).catch(function (error) {
      renderPhotoStrip();
      updateReady();
      toast(error.message || 'Foto gagal diproses.');
    });
  }

  function addOnePhoto(file, source) {
    if (state.photos.length >= WT.OPTIONS.MAX_PHOTOS) return Promise.resolve();

    var signature = overlaySignature();
    var fromGallery = source === 'gallery';

    return (fromGallery ? WT.exif.read(file) : Promise.resolve(null)).then(function (exif) {
      var fix = null;
      var captured;

      if (fromGallery) {
        /* Never the phone's current position or clock. The picture was taken
           somewhere else, at some other time, and stamping "here, now" onto it
           would put a straightforward falsehood into the one part of the record
           nothing downstream can check. Its own Exif, or nothing. */
        if (exif && exif.latitude != null) {
          fix = { latitude: exif.latitude, longitude: exif.longitude };
        }
        captured = (exif && exif.takenAt) ||
          (file.lastModified ? new Date(file.lastModified) : new Date());
      } else {
        if (state.gps.state === 'ok') {
          fix = { latitude: state.gps.latitude, longitude: state.gps.longitude };
        }
        captured = new Date();
      }

      var lookup = fix ? addressFor(fix.latitude, fix.longitude) : Promise.resolve(null);

      return lookup.then(function (address) {
        if (address) state.lastAddress = address;

        var meta = {
          zone: state.area.zone,
          segment: state.area.segment,
          segmentName: segmentName(),
          pipeSize: pipeSize(),
          kp: state.form.kp,
          conditionLabel: state.form.condition,
          conditionText: conditionStampText(),
          team: crewNames(),
          timestamp: WT.timestampOf(captured),
          latitude: fix ? fix.latitude : null,
          longitude: fix ? fix.longitude : null,
          addressText: WT.geo.addressText(address)
        };

        /* The seal is computed from the file as the camera handed it over,
           before anything is drawn on it — see seal.js. It has to happen here
           rather than inside the photo pipeline so that the code printed on the
           picture and the digest filed in the spreadsheet are the same object
           and cannot drift apart. */
        return WT.seal.compute(file, meta).then(function (seal) {
          meta.seal = seal;
          return WT.photo.process(file, meta).then(function (processed) {
            // Checked again on the way out, not only on the way in: processing
            // takes a second or two, and two captures started inside that
            // window would both have seen room for one more.
            if (state.photos.length >= WT.OPTIONS.MAX_PHOTOS) return;
            processed.signature = signature;
            processed.source = source;
            processed.latitude = meta.latitude;
            processed.longitude = meta.longitude;
            processed.takenAt = meta.timestamp;
            processed.sealCode = seal.code;
            processed.sealDigest = seal.digest;
            processed.sealAlgo = seal.algo;
            state.photos.push(processed);
          });
        });
      });
    });
  }

  var stripUrls = [];
  function renderPhotoStrip() {
    stripUrls.forEach(URL.revokeObjectURL);
    stripUrls = [];

    var strip = $('photo-strip');
    strip.innerHTML = '';
    $('photos-label').textContent =
      'Foto ' + state.photos.length + ' dari ' + WT.OPTIONS.MAX_PHOTOS;

    state.photos.forEach(function (photo, index) {
      var cell = document.createElement('div');
      cell.className = 'shot';

      var image = document.createElement('img');
      var url = URL.createObjectURL(photo.thumb);
      stripUrls.push(url);
      image.src = url;
      image.alt = '';
      cell.appendChild(image);

      /* A gallery pick is marked, because it is a different kind of evidence:
         it was not taken here and now, and it carries coordinates only if its
         own Exif had them. */
      if (photo.source === 'gallery') {
        var tag = document.createElement('span');
        tag.className = 'shot-tag';
        tag.textContent = photo.latitude == null ? 'galeri · tanpa GPS' : 'galeri';
        cell.appendChild(tag);
      }

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'shot-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Hapus');
      remove.addEventListener('click', function () {
        state.photos.splice(index, 1);
        renderPhotoStrip();
        updateReady();
      });
      cell.appendChild(remove);

      strip.appendChild(cell);
    });

    renderStaleWarning();
  }

  /**
   * Marks any photograph whose burned-in text no longer matches the form.
   *
   * Kept apart from building the strip because it has to run on every
   * keystroke, and rebuilding the thumbnails that often would revoke and
   * recreate three object URLs for nothing.
   */
  function renderStaleWarning() {
    var current = overlaySignature();
    var cells = $('photo-strip').children;
    var stale = false;

    state.photos.forEach(function (photo, index) {
      var outdated = photo.signature !== current;
      if (outdated) stale = true;
      if (cells[index]) cells[index].classList.toggle('stale', outdated);
    });

    var warning = $('photo-warn');
    warning.textContent = stale
      ? 'Ada data yang berubah setelah foto diambil. Tulisan di foto masih yang lama — ambil ulang bila penting.'
      : '';
    warning.classList.toggle('hidden', !stale);
  }

  /* ── Saving ─────────────────────────────────────────────────────────── */

  $('save-point').addEventListener('click', function () {
    if (this.disabled) return;

    /* Checked again here, not only through the button's disabled state. Whether
       the button is live is a matter of the interface staying in sync; whether a
       point is complete enough to store is a matter of the data, and the data
       must not depend on the interface being right. */
    if (missingForPhoto().length || state.photos.length < WT.OPTIONS.MIN_PHOTOS) {
      updateReady();
      toast($('save-blocker').textContent);
      return;
    }

    var button = this;
    button.disabled = true;

    var gps = state.gps;
    var hasFix = gps.state === 'ok';
    var now = new Date();
    var address = state.lastAddress;

    var record = {
      date: WT.dateOf(now),
      time: WT.timeOf(now),
      timestamp: WT.timestampOf(now),

      team: state.crew.team,
      reporter: state.crew.reporter,
      mates: state.crew.mates.slice(),

      zone: state.area.zone,
      segment: state.area.segment,
      segmentName: segmentName(),
      pipeSize: pipeSize(),
      /* The stretch this crew was sent to walk, stored on every record rather
         than once for the day. A day can carry two assignments, and the office
         checking coverage needs to know which stretch each KP belongs to — not
         which one happened to be on screen when the file was exported. */
      assignFrom: state.area.kpFrom,
      assignTo: state.area.kpTo,

      kp: state.form.kp,
      conditionLabel: state.form.condition,
      note: noteText(),

      latitude: hasFix ? gps.latitude : null,
      longitude: hasFix ? gps.longitude : null,
      accuracy: hasFix ? gps.accuracy : null,
      addressText: WT.geo.addressText(address),

      /* Time, position and seal are kept per photograph, not per point. Three
         shots are taken minutes and tens of metres apart, and a gallery pick may
         carry a time from another day or none at all — one set of numbers for
         the row could only be right about one of them. */
      photos: state.photos.map(function (photo) {
        return {
          blob: photo.blob,
          thumb: photo.thumb,
          width: photo.width,
          height: photo.height,
          latitude: photo.latitude,
          longitude: photo.longitude,
          source: photo.source,
          takenAt: photo.takenAt,
          sealCode: photo.sealCode,
          sealDigest: photo.sealDigest,
          sealAlgo: photo.sealAlgo
        };
      })
    };

    WT.db.add(record).then(function (saved) {
      /* No `button.disabled = false` here. resetAfterSave() has just emptied the
         form and asked updateReady() to decide, and the answer is "not ready" —
         re-enabling unconditionally is what would let an empty point be saved on
         the very next tap. Only updateReady() sets this button. */
      resetAfterSave();
      refreshCount();
      toast('Tersimpan.');
      // Straight to the send screen: one KP, one message, then the next.
      openSend(saved);
    }).catch(function (error) {
      // The form is untouched and still complete, so this puts the button back.
      updateReady();
      toast('Gagal menyimpan: ' + describe(error));
    });
  });

  /**
   * Clears what belongs to one KP and keeps what belongs to the walk.
   *
   * The crew and the assignment stay — they are the same all day. The KP is
   * always cleared: it is the identity of the record, and a carried-over value
   * would look entirely valid while being the previous point's.
   *
   * The condition goes back to the everyday answer rather than to nothing, so
   * the ordinary case is one tap on the KP and three photographs. It is on
   * screen in full underneath, so it is never sent unseen.
   */
  function resetAfterSave() {
    state.form.kp = '';
    state.form.other = '';
    state.form.condition = WT.OPTIONS.conditions[0].label;
    state.photos = [];

    $('f-kp').value = '';
    $('f-other').value = '';
    syncCondition();
    renderPhotoStrip();
    updateReady();
  }

  /* ── Counts ─────────────────────────────────────────────────────────── */

  function refreshCount() {
    return WT.db.all().then(function (records) {
      var today = WT.dateOf(new Date());
      var todayCount = records.filter(function (r) { return r.date === today; }).length;
      var older = records.length - todayCount;
      var unsent = records.filter(function (r) { return !r.sentAt; }).length;
      var unexported = records.filter(function (r) { return !r.exportedAt; }).length;

      $('today-count').textContent =
        (todayCount === 0 ? 'Belum ada KP hari ini' : todayCount + ' KP hari ini') +
        (older > 0 ? ' · ' + older + ' hari sebelumnya' : '') +
        (unsent > 0 && records.length ? ' · ' + unsent + ' belum dikirim' : '');

      $('go-export').disabled = records.length === 0;
      // Counts what would actually go, so a second run does not read as if it
      // were about to repeat the whole day.
      $('go-export').textContent = unexported
        ? 'Export ke Excel (' + unexported + ')'
        : 'Export ke Excel';
      return records;
    });
  }

  /* ── Send one point ─────────────────────────────────────────────────── */

  var sendUrls = [];

  /**
   * Prepares one point for the share sheet.
   *
   * The Files are built here rather than in the button handler. Everything
   * between the tap and navigator.share() is time in which the browser can
   * decide the tap no longer counts, and it then refuses with NotAllowedError —
   * so the handler is left with a single statement to run.
   *
   * THE PHOTOGRAPHS GO WITHOUT `text`, DELIBERATELY. Handing WhatsApp three
   * images and a caption together does not produce one message: WhatsApp copies
   * that caption onto every image, so the group receives the same report three
   * times, once under each photograph, and no album at all. Sent as three plain
   * images they arrive as one album, and the caption is pasted into WhatsApp's
   * own caption box — which is the only way to get one report under one album,
   * and is also how the other crews' reports are put together.
   *
   * So the caption travels by clipboard rather than in the payload. It is
   * copied inside the same tap, before share() is called.
   */
  function openSend(record) {
    var caption = WT.caption.build(record);
    var base = WT.fileSafe('WT ' + record.segment + ' ' + record.kp);

    var files = (record.photos || []).map(function (photo, index) {
      return new File([photo.blob], base + '_' + (index + 1) + '.jpg',
        { type: 'image/jpeg' });
    });

    var mode = 'none';
    if (navigator.canShare && files.length && navigator.canShare({ files: files })) {
      mode = 'files';
    }

    state.sending = { record: record, caption: caption, files: files, mode: mode };
    renderSend();
    show('send');
  }

  function renderSend() {
    sendUrls.forEach(URL.revokeObjectURL);
    sendUrls = [];

    var sending = state.sending;
    var strip = $('send-photos');
    strip.innerHTML = '';

    (sending.record.photos || []).forEach(function (photo) {
      var cell = document.createElement('div');
      cell.className = 'shot';
      var image = document.createElement('img');
      var url = URL.createObjectURL(photo.thumb || photo.blob);
      sendUrls.push(url);
      image.src = url;
      image.alt = '';
      cell.appendChild(image);
      strip.appendChild(cell);
    });

    // textContent, never innerHTML: the caption carries operator input.
    $('send-caption').textContent = sending.caption;

    $('send-share').disabled = sending.mode === 'none';

    /* The steps are on screen every time, not hidden behind a help link. The
       paste is the one part of the whole app that cannot be automated — the
       caption box belongs to WhatsApp — so it has to be the most obvious thing
       on the screen rather than something the crew are expected to remember. */
    var steps = $('send-steps');
    steps.innerHTML = '';
    if (sending.mode === 'none') {
      steps.textContent = 'Browser ini tidak bisa membagikan foto. Buka lewat Chrome (Android) atau Safari (iPhone).';
    } else {
      [
        'Pilih grup WhatsApp',
        'Tekan lama kolom caption → Tempel',
        'Kirim'
      ].forEach(function (text, index) {
        var row = document.createElement('span');
        row.className = 'step';
        var number = document.createElement('b');
        number.textContent = String(index + 1);
        row.appendChild(number);
        row.appendChild(document.createTextNode(text));
        steps.appendChild(row);
      });
    }

    $('send-note').textContent = sending.mode === 'none' ? ''
      : 'Caption disalin otomatis saat tombol ditekan. 3 foto dikirim sebagai satu album.';
    $('send-status').textContent = '';
    $('send-env').classList.add('hidden');
  }

  $('send-back').addEventListener('click', function () { show('form'); refreshCount(); });
  $('send-next').addEventListener('click', function () { show('form'); refreshCount(); });

  $('send-share').addEventListener('click', function () {
    var sending = state.sending;
    if (!sending || sending.mode === 'none') {
      $('send-status').textContent = 'Browser ini tidak bisa membagikan foto.';
      showEnvironment('send-env');
      return;
    }

    /* The clipboard first, and deliberately NOT awaited. Waiting on it would
       spend the tap that authorises the share sheet, and the share would then be
       refused with NotAllowedError — the failure that looks like everything
       else. Fired off now, it has resolved long before the operator has finished
       picking a group. */
    copyCaption(sending.caption);

    /* Photographs only. Adding the caption here is what put the same report
       under all three of them, three times over — see openSend(). */
    handToShareSheet({ files: sending.files }, 'send-status', 'send-env', function () {
      var count = sending.files.length;
      WT.db.markSent([sending.record.id], new Date().toISOString())
        .then(function () {
          $('send-status').textContent = count +
            ' foto dikirim. Caption sudah disalin — tempel di kolom caption WhatsApp.';
          refreshCount();
        });
    });
  });

  /**
   * Puts the caption on the clipboard.
   *
   * This is not a convenience any more — it is how the caption reaches WhatsApp
   * at all. The report cannot travel with the photographs (WhatsApp would stamp
   * it onto each one separately), so it travels here and the operator pastes it
   * into WhatsApp's own caption box.
   *
   * The old execCommand path is kept because navigator.clipboard is unavailable
   * on plain http and in a few in-app browsers, which are exactly the places
   * this app has to survive. It runs synchronously, which also makes it safe to
   * call in the same tap as a share.
   *
   * `announce` is false when this runs alongside a share: the status line then
   * belongs to the share, and two messages fighting over it reads as a fault.
   */
  function copyCaption(text, announce) {
    if (!text) return;

    function say(message) {
      if (announce) $('send-status').textContent = message;
    }

    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(area);
      say(ok ? 'Caption disalin.' : 'Gagal menyalin — salin manual dari kotak di atas.');
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      // Not awaited by the caller: see the share handler.
      navigator.clipboard.writeText(text).then(function () {
        say('Caption disalin.');
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  $('send-copy').addEventListener('click', function () {
    copyCaption(state.sending ? state.sending.caption : '', true);
  });

  /* ── List ───────────────────────────────────────────────────────────── */

  $('view-list').addEventListener('click', function () { renderList(); show('list'); });
  $('list-back').addEventListener('click', function () { show('form'); refreshCount(); });

  var listUrls = [];
  function renderList() {
    listUrls.forEach(URL.revokeObjectURL);
    listUrls = [];

    WT.db.all().then(function (records) {
      var body = $('list-body');
      body.innerHTML = '';
      $('list-title').textContent = records.length + ' KP tersimpan';

      if (!records.length) {
        var empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'Belum ada data.';
        body.appendChild(empty);
        return;
      }

      records.slice().reverse().forEach(function (record) {
        var card = document.createElement('div');
        card.className = 'card';

        var image = document.createElement('img');
        var first = (record.photos || [])[0];
        if (first) {
          var url = URL.createObjectURL(first.thumb || first.blob);
          listUrls.push(url);
          image.src = url;
        }
        image.alt = '';
        card.appendChild(image);

        var info = document.createElement('div');
        info.className = 'card-body';

        var title = document.createElement('b');
        title.textContent = WT.kpText(record.kp) + ' · Segment ' + record.segment;
        info.appendChild(title);

        var where = document.createElement('div');
        where.className = 'meta';
        where.textContent = record.zone + ' · ' + WT.sizeText(record.pipeSize) +
          ' · ' + (record.photos || []).length + ' foto';
        info.appendChild(where);

        var what = document.createElement('div');
        what.className = 'meta';
        what.textContent = record.conditionLabel + ' · ' + record.time;
        info.appendChild(what);

        var badges = document.createElement('div');
        badges.className = 'badges';
        if (record.sentAt) badges.appendChild(badge('terkirim', 'ok'));
        if (record.exportedAt) badges.appendChild(badge('diexport', 'flat'));
        info.appendChild(badges);

        card.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'card-actions';

        var send = document.createElement('button');
        send.className = 'link';
        send.textContent = 'Kirim';
        send.addEventListener('click', function () { openSend(record); });
        actions.appendChild(send);

        var remove = document.createElement('button');
        remove.className = 'danger-link';
        remove.textContent = 'Hapus';
        remove.addEventListener('click', function () {
          if (!confirm('Hapus ' + WT.kpText(record.kp) + '?')) return;
          WT.db.remove(record.id).then(function () {
            renderList();
            refreshCount();
            toast('Dihapus.');
          });
        });
        actions.appendChild(remove);

        card.appendChild(actions);
        body.appendChild(card);
      });
    });
  }

  function badge(text, kind) {
    var span = document.createElement('span');
    span.className = 'badge ' + kind;
    span.textContent = text;
    return span;
  }

  /* ── Excel export ───────────────────────────────────────────────────── */

  $('go-export').addEventListener('click', function () { openExport(); });
  $('export-back').addEventListener('click', function () { show('form'); refreshCount(); });

  function openExport() {
    state.built = null;
    state.includeExported = false;
    $('export-ready').classList.add('hidden');
    $('export-build').classList.remove('hidden');
    $('export-status').textContent = '';
    $('export-env').classList.add('hidden');
    show('export');
    renderExport();
  }

  /**
   * Works out what the next file will contain.
   *
   * Points already written into a spreadsheet are left out by default.
   * Exporting twice is normal — a stretch finished before lunch, another after —
   * and without this the second file would repeat the first, so the office would
   * have to find and drop the duplicate rows.
   */
  function renderExport() {
    return WT.db.all().then(function (all) {
      var fresh = all.filter(function (record) { return !record.exportedAt; });
      var doneCount = all.length - fresh.length;
      var chosen = state.includeExported ? all : fresh;
      state.chosen = chosen;

      var dates = [];
      chosen.forEach(function (record) {
        if (dates.indexOf(record.date) === -1) dates.push(record.date);
      });
      dates.sort();

      $('export-summary').textContent = chosen.length === 0
        ? (doneCount > 0 ? 'Semua data sudah diexport.' : 'Belum ada data untuk diexport.')
        : (dates.length === 1
            ? chosen.length + ' KP dari ' + dates[0]
            : chosen.length + ' KP dari ' + dates.length + ' hari (' + dates.join(', ') + ')');

      var include = $('export-include');
      if (doneCount > 0) {
        include.classList.remove('hidden');
        include.textContent = state.includeExported
          ? 'Jangan sertakan ' + doneCount + ' yang sudah diexport'
          : 'Sertakan juga ' + doneCount + ' yang sudah diexport';
      } else {
        include.classList.add('hidden');
      }

      renderExportSize(chosen);
      $('export-build').disabled = chosen.length === 0;
    });
  }

  /* WhatsApp refuses a document over about 100 MB, and a phone assembling one
     holds the photographs and the finished file in memory at the same time — so
     it runs out well before that. A day is around 20 MB, so neither is reachable
     by exporting daily; both are reachable by not exporting for a fortnight,
     which is exactly when nobody wants a surprise. */
  var SIZE_WARN_MB = 50;
  var SIZE_LIMIT_MB = 95;

  /**
   * States the finished size before anything is built.
   *
   * It can be known exactly: the photographs go into the zip stored rather than
   * compressed, so the file is the sum of their bytes plus a few kilobytes of
   * XML.
   */
  function renderExportSize(chosen) {
    var bytes = 0;
    chosen.forEach(function (record) {
      (record.photos || []).forEach(function (photo) {
        if (photo && photo.blob) bytes += photo.blob.size;
      });
    });

    var mb = bytes / 1048576;
    $('export-size').textContent = chosen.length
      ? 'Perkiraan ukuran file: ' + mb.toFixed(mb < 10 ? 1 : 0) + ' MB'
      : '';

    var warning = $('export-warn');
    if (mb >= SIZE_LIMIT_MB) {
      warning.textContent = 'File ' + Math.round(mb) + ' MB — terlalu besar untuk WhatsApp ' +
        'dan berisiko gagal dibuat di HP. Export sebagian dulu.';
      warning.classList.remove('hidden');
    } else if (mb >= SIZE_WARN_MB) {
      warning.textContent = 'File ' + Math.round(mb) + ' MB — besar. Sebaiknya export lebih sering.';
      warning.classList.remove('hidden');
    } else {
      warning.classList.add('hidden');
    }
  }

  $('export-include').addEventListener('click', function () {
    state.includeExported = !state.includeExported;
    renderExport();
  });

  /**
   * Puts the route that actually works on this phone first.
   *
   * On Android that is the download, because Chrome will not share a spreadsheet
   * at all — see fileShareLikelyBlocked(). Leaving the share button on top there
   * means every export starts with a tap that is guaranteed to fail, every day,
   * and an operator reasonably concludes the app is broken.
   */
  function arrangeExportButtons() {
    var ready = $('export-ready');
    var share = $('export-share');
    var download = $('export-download');
    var route = $('export-route');

    if (fileShareLikelyBlocked()) {
      ready.insertBefore(download, share);
      download.className = 'primary';
      share.className = 'secondary';
      route.textContent = 'File tersimpan di folder Download. ' +
        'Kirim lewat WhatsApp › grup › Lampirkan › Dokumen.';
    } else {
      ready.insertBefore(share, download);
      share.className = 'primary';
      download.className = 'secondary';
      route.textContent = '';
    }
  }

  $('export-build').addEventListener('click', function () {
    var button = this;
    button.disabled = true;
    var status = $('export-status');

    var records = state.chosen.slice();
    if (!records.length) {
      button.disabled = false;
      status.textContent = 'Tidak ada data untuk diexport.';
      return;
    }

    status.textContent = 'Menyusun file…';
    WT.xlsx.build(records, function (done, total) {
      status.textContent = 'Menulis foto ' + done + ' dari ' + total + '…';
    }).then(function (blob) {
      /* Date AND time. Exporting twice in a day is normal, and with only the
         date both files carry the same name — two identical-looking attachments
         in the group, and the second silently overwriting the first when the
         office saves them into one folder. */
      var filename = 'WT_' + WT.stampOf(new Date()) + '_' +
        WT.fileSafe(state.crew.reporter) + '.xlsx';

      var file = new File([blob], filename, { type: XLSX_MIME });

      state.built = {
        blob: blob,
        file: file,
        filename: filename,
        count: records.length,
        ids: records.map(function (record) { return record.id; }),
        /* Asked now rather than inside the tap, so the share handler has nothing
           to do but share. */
        shareable: !!(navigator.canShare && navigator.canShare({ files: [file] }))
      };

      $('export-filename').textContent = filename + ' · ' +
        (blob.size / 1048576).toFixed(1) + ' MB · ' + records.length + ' KP';
      arrangeExportButtons();
      $('export-ready').classList.remove('hidden');
      button.classList.add('hidden');
      status.textContent = 'File siap. Foto ' +
        WT.xlsx.PHOTO_WIDTH_CM.toFixed(2) + ' × ' +
        WT.xlsx.PHOTO_HEIGHT_CM.toFixed(2) + ' cm, seragam.';
    }).catch(function (error) {
      button.disabled = false;
      status.textContent = 'Gagal: ' + describe(error);
    });
  });

  /* Share runs straight off the tap with the file already in hand. Awaiting
     anything first costs the page its permission to open the share sheet, and it
     then silently never appears — which is why building is a separate button. */
  $('export-share').addEventListener('click', function () {
    if (!state.built) return;

    if (!state.built.shareable) {
      $('export-status').textContent =
        'Browser ini tidak bisa membagikan file Excel. Pakai Simpan ke Files.';
      showEnvironment('export-env');
      return;
    }

    /* The file and nothing else. Passing title or text alongside files is a
       documented way to make Safari reject the share outright, and the filename
       already travels with the File. */
    handToShareSheet({ files: [state.built.file] }, 'export-status', 'export-env',
      function () {
        var count = state.built.count;
        markExported().then(function () {
          $('export-status').textContent = 'File berisi ' + count + ' KP terkirim.';
          refreshCount();
        });
      });
  });

  /** Stamps the batch that was just handed over. */
  function markExported() {
    if (!state.built) return Promise.resolve();
    return WT.db.markExported(state.built.ids, new Date().toISOString());
  }

  $('export-download').addEventListener('click', function () {
    if (!state.built) return;
    var url = URL.createObjectURL(state.built.blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = state.built.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    markExported().then(function () {
      $('export-status').textContent = 'Tersimpan di folder Download. ' +
        'Kirim lewat WhatsApp › grup › Lampirkan › Dokumen.';
      /* Saving from a home-screen web app needs iOS 16.4+; below that the tap
         does nothing at all and there is no error to catch, so the phone's
         details are worth showing. On Android the save works, so the line is
         cleared instead — a diagnostic left over from a failed share would read
         as if this one had failed too. */
      if (isAndroid()) $('export-env').classList.add('hidden');
      else showEnvironment('export-env');
      refreshCount();
    });
  });

  /**
   * Frees storage, and deliberately only touches points already in a file.
   *
   * An operator reaching for this mid-walk cannot destroy work that has never
   * left the phone.
   */
  $('export-clear').addEventListener('click', function () {
    WT.db.all().then(function (all) {
      var done = all.filter(function (record) { return record.exportedAt; });
      if (!done.length) { toast('Belum ada data yang sudah diexport.'); return; }
      if (!confirm('Hapus ' + done.length + ' KP yang sudah diexport dari HP?')) return;
      return WT.db.removeMany(done.map(function (r) { return r.id; }))
        .then(function () {
          state.built = null;
          toast(done.length + ' KP dihapus.');
          show('form');
          refreshCount();
        });
    });
  });

  /* ── Diagnostics ────────────────────────────────────────────────────── */

  /**
   * Shows which version this phone is actually running.
   *
   * Read from the name of the live cache rather than a constant in the page,
   * because a constant would be served from that same stale cache and cheerfully
   * report the new version while running the old one. The cache name is the one
   * thing that cannot lie about itself.
   */
  function showVersion() {
    var line = $('app-version');
    if (!window.caches || !caches.keys) { line.textContent = ''; return; }
    caches.keys().then(function (names) {
      var mine = names.filter(function (name) { return name.indexOf('wt-surveillance-') === 0; });
      var controlled = navigator.serviceWorker && navigator.serviceWorker.controller;
      line.textContent = mine.length
        ? mine.sort().join(', ') + (controlled ? '' : ' · reload to apply')
        : 'not cached';
    }).catch(function () { line.textContent = ''; });
  }

  /**
   * The handful of facts that decide whether sharing can work here.
   *
   * Shown only after a failure. Sharing is the genuinely divergent part of the
   * platform — canShare() can say yes on both iOS and Android and only one of
   * them actually hands the files over — so a report that does not say which
   * phone it came from is close to useless.
   */
  function showEnvironment(lineId) {
    var agent = navigator.userAgent;
    var standalone = window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true;

    var platform;
    var ios = agent.match(/OS (\d+)[_.](\d+)/);
    var android = agent.match(/Android (\d+(?:\.\d+)?)/);
    if (/iPhone|iPad|iPod/.test(agent)) {
      platform = ios ? 'iOS ' + ios[1] + '.' + ios[2] : 'iOS';
    } else if (android) {
      platform = 'Android ' + android[1];
    } else {
      platform = navigator.platform || 'unknown';
    }

    var line = $(lineId);
    line.textContent = [
      standalone ? 'home screen' : 'browser tab',
      platform,
      'share ' + (navigator.share ? 'yes' : 'no'),
      'canShare ' + (navigator.canShare ? 'yes' : 'no'),
      // Web Share needs a secure context. Served over plain http it is either
      // missing or refuses, and that is invisible from the error alone.
      window.isSecureContext ? 'secure' : 'NOT SECURE',
      sharePending ? 'share still open' : 'share idle'
    ].join(' · ');
    line.classList.remove('hidden');
  }

  /* ── Start-up ───────────────────────────────────────────────────────── */

  function init() {
    buildTeamChips();
    buildZoneChips();
    buildConditionChips();

    // The everyday answer, pre-selected. It is shown in full underneath, so it
    // is never sent unseen — and the ordinary KP is then one field and three
    // photographs.
    state.form.condition = WT.OPTIONS.conditions[0].label;

    WT.db.getPref('crew', null).then(function (crew) {
      if (crew && crew.reporter) {
        state.crew = {
          team: crew.team || '',
          reporter: crew.reporter,
          mates: crew.mates || []
        };
      }
      return WT.db.getPref('area', null);
    }).then(function (area) {
      if (area && area.segment) {
        state.area = {
          zone: area.zone || '',
          segment: area.segment,
          size: area.size || '',
          kpFrom: area.kpFrom || '',
          kpTo: area.kpTo || ''
        };
      }

      renderCrew();
      renderArea();
      renderAssignment();
      syncCondition();
      renderGps();
      renderPhotoStrip();
      updateReady();

      /* Where to start: whoever is walking, and where. Both were answered
         yesterday and are almost always still true, so a returning phone opens
         straight on the survey screen rather than making the crew re-answer two
         screens before their first KP. */
      /* The assignment is only complete with its stretch, so a phone carrying an
         older one — saved before the stretch existed — stops on the assignment
         screen rather than opening on a survey it cannot describe. */
      if (state.crew.reporter && state.area.segment &&
          WT.isKpComplete(state.area.kpFrom) && WT.isKpComplete(state.area.kpTo)) {
        show('form');
        refreshCount();
      } else if (state.crew.reporter) {
        show('area');
      } else {
        show('team');
      }
    }).catch(function (error) {
      /* Every screen starts hidden and this chain is what reveals one, so a
         failure here — a database that will not open, most likely — otherwise
         leaves a blank page with nothing to report. Show something, and say what
         happened. */
      show('team');
      toast('Gagal memulai: ' + describe(error));
    });

    WT.geo.watch(function (update) { state.gps = update; renderGps(); });

    // Without this, the phone treats a walk's photographs as ordinary cache and
    // may evict them under storage pressure.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

    showVersion();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (registration) {
        // Ask on every launch. iOS only checks for a new worker on a real
        // navigation, and resuming a home-screen app from the app switcher is
        // not one — without this an update can sit unnoticed for days.
        registration.update();
        if (navigator.serviceWorker.addEventListener) {
          navigator.serviceWorker.addEventListener('controllerchange', showVersion);
        }
        setTimeout(showVersion, 1500);
      }).catch(function () {
        // Offline start-up will not work, but everything else still does.
        showVersion();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
}(window.WT));
