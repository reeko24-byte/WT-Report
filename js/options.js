/* Walkthrough Surveillance vocabulary, number handling and time formatting.
 *
 * Everything in OPTIONS is DATA. It is written into the WhatsApp report and
 * into the spreadsheet exactly as spelled here, so the group and the office
 * stay in one vocabulary. Changing a spelling here silently splits one segment,
 * or one crew member, into two the next time somebody sorts the sheet.
 *
 * Sources:
 *   roster      the personnel list (names and badge numbers as issued)
 *   zones       the ARROW Android app's two work areas, written the way the
 *               report writes them ("South Area", not "South")
 *   segments    the segment table (name, diameter), split by zone the way
 *               AssetOptions.kt splits it
 *   conditions  the two answers the brief allows for the Note line
 */

var WT = window.WT || {};

WT.OPTIONS = {

  /* Which crew an operator belongs to. The zone is only a DEFAULT for the
     assignment screen -- a Duri crew sent north picks North Area and the app
     does not argue. */
  teams: [
    { id: 'Duri',   label: 'Pipeline Walkthrough (Duri)',   zone: 'South Area' },
    { id: 'Bangko', label: 'Pipeline Walkthrough (Bangko)', zone: 'North Area' },
    { id: 'South',  label: 'Pipeline Walkthrough (South)',  zone: 'South Area' }
  ],

  /* Names exactly as the personnel list spells them, with the badge number so
     two people with similar names can be told apart on the picker.

     The personnel list gives Nurdianto no area; the South crew is his, and he is
     its only member. A one-man crew is a normal state here, not an error -- the
     app only ever requires a reporter, and team-mates are optional.

     The team-mate picker still offers the WHOLE roster whichever team is chosen,
     because the approved example report is filed by Ari Kurniawan (Duri) walking
     with Nurdianto (South). Crews lend each other people, and a picker that
     could not express that would be wrong about the very report it was built
     from. */
  roster: [
    { name: 'Ari Kurniawan',             badge: 'BRA09-24060046', team: 'Duri' },
    { name: 'Dewangga Salsabila',        badge: 'BRA09-24060017', team: 'Duri' },
    { name: 'Rydho Hidayat',             badge: 'BRA09-24060053', team: 'Duri' },
    { name: 'Ibnu Al Mujahidin Gunawan', badge: 'BRA09-25040066', team: 'Duri' },
    { name: 'Reyhan Muhammad Syaiqal',   badge: 'BRA09-24060019', team: 'Bangko' },
    { name: 'Irwan',                     badge: 'BRA09-24060057', team: 'Bangko' },
    { name: 'Juhar',                     badge: 'BRA09-24060051', team: 'Bangko' },
    { name: 'Robby Gusviando',           badge: 'BRA09-24060048', team: 'Bangko' },
    { name: 'Nanda Irawan',              badge: 'BRA09-24060058', team: 'Bangko' },
    { name: 'Nurdianto',                 badge: 'BRA09-24060052', team: 'South' }
  ],

  /* The report writes "South Area", so that is what is stored. The Android app
     stores the bare "South"; these are the same two areas, spelled for the
     audience each app is written for. */
  zones: ['North Area', 'South Area'],

  /* id      what the report calls the segment: "Segment : 4(KOTA BATAK-KBJ)"
     name    the two ends, no spaces around the dash, as the example writes it
     size    nominal diameters in inches -- a LIST, which fills Size Pipe by
             itself and prints as 8" or 24" & 20"
     end     how many metres the segment runs, which is what "seluruh segment"
             fills the assigned stretch with
     zone    which work area it belongs to, following AssetOptions.kt

     The lengths are the as-built figures from `SegmentKpRange.kt` in the Android
     app -- measured off the Rokan project KMZ, not the project archive, which
     several of them disagreed with. They are used here only to offer a default
     stretch; nothing is ever refused for falling outside one.

     "10/12" IS ONE SEGMENT, exactly as the Android app has it. The two pipes run
     the same Batang-Dumai right-of-way and the crew walk them as one, so the
     report names one segment carrying both diameters -- 24" and 20" -- rather
     than making the walk choose a pipe it is not walking. That is why size is a
     list here and not a number: a segment with two pipes is a real state, not an
     unfilled field. */
  segments: [
    { id: '1',     name: 'GS1-MTF',         size: [8],      end: 2020,  zone: 'South Area' },
    { id: '2',     name: 'MTF-NBS',         size: [10],     end: 16600, zone: 'South Area' },
    { id: '3',     name: 'NBS-DURI',        size: [20],     end: 57070, zone: 'South Area' },
    { id: '4',     name: 'KOTA BATAK-KBJ',  size: [8],      end: 33750, zone: 'South Area' },
    { id: '5',     name: 'LIBO-MINDAL',     size: [4],      end: 12950, zone: 'South Area' },
    { id: '6',     name: 'DURI CPS-BATANG', size: [20],     end: 39730, zone: 'North Area' },
    { id: '7',     name: 'BANGKO-BATANG',   size: [16],     end: 47170, zone: 'North Area' },
    { id: '8',     name: 'BALAM-BANGKO',    size: [8],      end: 12820, zone: 'North Area' },
    { id: '9',     name: 'BENAR-BANGKO',    size: [4],      end: 10740, zone: 'North Area' },
    { id: '10/12', name: 'BATANG-DUMAI',    size: [24, 20], end: 36800, zone: 'North Area' },
    { id: '11A',   name: 'CGS1-CGS10',      size: [8],      end: 9530,  zone: 'North Area' },
    { id: '11B',   name: 'CGS10-BATANG',    size: [20],     end: 26790, zone: 'North Area' }
  ],

  /* The Note line has exactly two answers, and the first is the one used all
     day. `label` is the short form -- it is what the operator taps, what the
     photograph is stamped with and what the spreadsheet can be filtered on.
     `note` is the full sentence that goes into the report.

     Keeping them apart is the point: "Area ROW Terpantau Aman" counts, and the
     sentence reads. One column of free text could do neither. */
  conditions: [
    {
      label: 'Area ROW Terpantau Aman',
      note: 'Area ROW saat ini terpantau aman dan tidak ada indikasi yg mencurigakan.'
    },
    { label: 'Lainnya', note: '' }
  ],

  /** The condition whose note is typed rather than canned. */
  CONDITION_OTHER: 'Lainnya',

  /** Three photographs per point -- the brief asks for three, and all three are
      required before a point can be saved. */
  MAX_PHOTOS: 3,
  MIN_PHOTOS: 3,

  /** The reporter plus up to three others: four names on the report at most. */
  MAX_TEAM_MATES: 3
};

/* -- Lookups ----------------------------------------------------------- */

WT.segmentsInZone = function (zone) {
  return WT.OPTIONS.segments.filter(function (segment) {
    return segment.zone === zone;
  });
};

WT.segmentById = function (id) {
  var found = null;
  WT.OPTIONS.segments.forEach(function (segment) {
    if (segment.id === id) found = segment;
  });
  return found;
};

WT.teamById = function (id) {
  var found = null;
  WT.OPTIONS.teams.forEach(function (team) {
    if (team.id === id) found = team;
  });
  return found;
};

WT.conditionByLabel = function (label) {
  var found = null;
  WT.OPTIONS.conditions.forEach(function (condition) {
    if (condition.label === label) found = condition;
  });
  return found;
};

/**
 * Every name on a report, reporter first -- the crew as the group reads it.
 *
 * One definition, used by the caption's tick list, the photograph's stamp and
 * the spreadsheet's Tim column, because they are answering the same question:
 * who walked this KP. They disagreed once -- the spreadsheet listed the crew
 * MINUS the reporter, so a two-man walk read as a one-man walk in the only
 * place anybody counts them -- and the way to stop that recurring is for there
 * to be nowhere else to get the answer.
 *
 * Takes anything with `reporter` and `mates`, which covers both a stored record
 * and the live crew on screen.
 */
WT.teamNames = function (crew) {
  if (!crew) return [];
  return [crew.reporter].concat(crew.mates || [])
    .filter(function (name) { return name && String(name).trim(); })
    .map(function (name) { return String(name).trim(); });
};

/** 12820 -> "12+820" -- a distance along the line, as a KP. */
WT.metresToKp = function (metres) {
  if (metres == null || isNaN(metres)) return '';
  var km = Math.floor(metres / 1000);
  var m = Math.round(metres % 1000);
  return (km < 10 ? '0' + km : String(km)) + '+' +
    (m < 10 ? '00' + m : m < 100 ? '0' + m : String(m));
};

/** Where a segment ends, as a KP: "12+820". Empty if we have no figure. */
WT.segmentEndKp = function (id) {
  var segment = WT.segmentById(id);
  return segment && segment.end != null ? WT.metresToKp(segment.end) : '';
};

/** "4(KOTA BATAK-KBJ)" -- how the report names a segment, in one string. */
WT.segmentText = function (id, name) {
  if (!id) return '';
  return name ? id + '(' + name + ')' : id;
};

/* -- KP ---------------------------------------------------------------- */

/**
 * Turns raw digits into the fixed KP shape: two digits, "+", three digits.
 *
 * The "+" is inserted as you type, which means the caret has to be pushed back
 * to the end by the caller -- otherwise typing 0,7,6,0,0 gives 07+006 instead
 * of 07+600: a KP that is wrong but looks entirely valid.
 */
WT.formatKp = function (rawInput) {
  var digitsOnly = String(rawInput).replace(/\D/g, '').slice(0, 5);
  return digitsOnly.length > 2
    ? digitsOnly.slice(0, 2) + '+' + digitsOnly.slice(2)
    : digitsOnly;
};

/** A complete KP is exactly "XX+XXX". */
WT.isKpComplete = function (kp) { return String(kp).length === 6; };

/** "26+000" -> 26000. The kilometre part times 1000, plus the metre part. */
WT.kpMetres = function (kp) {
  if (!WT.isKpComplete(kp)) return null;
  var parts = String(kp).split('+');
  return parseInt(parts[0], 10) * 1000 + parseInt(parts[1], 10);
};

/**
 * "26+000" -> "26 + 000" -- how a KP is PRINTED, spaced either side of the plus.
 *
 * Stored and typed without the spaces. The mask has to insert the "+" as you
 * type and the caret has to be pushed back past it, and doing that around
 * spaces as well is how a KP ends up "2 6 + 00"; comparing two of them, or
 * checking one against a segment's length, is also simpler on the tight form.
 * So the spacing belongs to printing, and printing only -- there is exactly one
 * canonical KP string in the database and it never carries a space.
 *
 * The spacing is the report's, and it is used everywhere the KP is read by a
 * person: the report, the photograph, the list and the spreadsheet.
 */
WT.kpPrint = function (kp) {
  return kp ? String(kp).replace('+', ' + ') : '';
};

/** "26+000" -> "KP 26 + 000", for the photograph and the list. */
WT.kpText = function (kp) { return kp ? 'KP ' + WT.kpPrint(kp) : ''; };

/**
 * The assigned stretch, as one string: "KP 00 + 000 - KP 10 + 000".
 *
 * A crew sent to a single KP rather than a stretch gets the short form, for the
 * same reason ROWPowerline shortens a power line that crosses at one point:
 * "KP 00 + 000 - KP 00 + 000" says nothing more and reads like a mistake.
 */
WT.kpRangeText = function (from, to) {
  if (!from && !to) return '';
  if (!to || from === to) return WT.kpText(from);
  if (!from) return WT.kpText(to);
  return WT.kpText(from) + ' - ' + WT.kpText(to);
};

/**
 * Whether a KP falls inside an assigned stretch.
 *
 * The ends are taken in whichever order they were typed -- a crew walking back
 * down the line enters the high KP first as often as not, and that is not an
 * error worth a message. Returns true when anything is missing: this only ever
 * raises a flag, and a flag raised on incomplete information is just noise.
 */
WT.kpWithin = function (kp, from, to) {
  var at = WT.kpMetres(kp);
  var a = WT.kpMetres(from);
  var b = WT.kpMetres(to);
  if (at == null || a == null || b == null) return true;
  return at >= Math.min(a, b) && at <= Math.max(a, b);
};

/* -- Numbers ----------------------------------------------------------- */

/**
 * Reads a number the way it was typed on a phone in the field.
 *
 * The separator is decided by SHAPE, never by assuming which convention was
 * meant, because an operator on an Indonesian phone types 8,5 where the report
 * prints 8.5 and both have to work:
 *
 *   both "." and ","   the last one is the decimal point
 *   only one of them   a decimal point if it appears once and is followed by
 *                      one or two digits ("8.5", "8,50"); otherwise a thousands
 *                      mark ("1,000", "1.000")
 *
 * Returns null for anything that is not a number, so a blank field and a zero
 * stay distinguishable. A typed inch mark is dropped first, so re-typing 8"
 * over the auto-filled value reads as 8 rather than as nothing.
 */
WT.parseNumber = function (text) {
  var raw = String(text == null ? '' : text).replace(/\s/g, '').replace(/["']/g, '');
  if (!raw) return null;

  var lastComma = raw.lastIndexOf(',');
  var lastDot = raw.lastIndexOf('.');
  var decimalAt = -1;

  if (lastComma !== -1 && lastDot !== -1) {
    decimalAt = Math.max(lastComma, lastDot);
  } else {
    var lone = lastComma !== -1 ? lastComma : lastDot;
    if (lone !== -1) {
      var digitsAfter = raw.length - lone - 1;
      var appearsOnce = raw.indexOf(raw.charAt(lone)) === lone;
      if (appearsOnce && digitsAfter >= 1 && digitsAfter <= 2) decimalAt = lone;
    }
  }

  var normalised = decimalAt === -1
    ? raw.replace(/[.,]/g, '')
    : raw.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + raw.slice(decimalAt + 1).replace(/[.,]/g, '');

  if (!/^-?\d*\.?\d*$/.test(normalised) || !/\d/.test(normalised)) return null;
  var value = parseFloat(normalised);
  return isNaN(value) ? null : value;
};

/**
 * Number formatting for the report: a comma groups the thousands, a full stop
 * marks the decimal, and trailing zeros are dropped -- so 8 reads "8" and 8.5
 * reads "8.5".
 */
WT.formatNumber = function (value, maxDecimals) {
  if (value == null || isNaN(value)) return '';
  var decimals = maxDecimals == null ? 2 : maxDecimals;
  var fixed = Number(value).toFixed(decimals);
  if (decimals > 0) fixed = fixed.replace(/\.?0+$/, '');

  var parts = fixed.split('.');
  var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? whole + '.' + parts[1] : whole;
};

/* -- Size Pipe -------------------------------------------------------- */

/* A segment can carry more than one pipe -- 10/12 runs a 24" and a 20" down the
   same right-of-way -- so a size is a LIST of diameters, not a number. A bare
   number is still accepted everywhere a list is, because records saved before
   this stored one. */

function sizeList(inches) {
  if (inches == null || inches === '') return [];
  return Object.prototype.toString.call(inches) === '[object Array]'
    ? inches
    : [inches];
}

/** [8] -> '8"',  [24, 20] -> '24" & 20"' -- the report line and the stamp. */
WT.sizeText = function (inches) {
  var parts = sizeList(inches)
    .map(function (value) { return WT.formatNumber(value, 2); })
    .filter(function (text) { return text; });
  return parts.length ? parts.join('" & ') + '"' : '';
};

/** [24, 20] -> '24 & 20' -- what goes in the editable field, without the marks. */
WT.sizeInputText = function (inches) {
  return sizeList(inches)
    .map(function (value) { return WT.formatNumber(value, 2); })
    .filter(function (text) { return text; })
    .join(' & ');
};

/**
 * Reads a typed Size Pipe back into a list.
 *
 * Deliberately generous about the separator: the field is pre-filled as
 * `24 & 20`, and an operator correcting it by hand will just as readily write
 * `24/20`, `24, 20` or `24 dan 20`. All of them mean the same thing, and none of
 * them is worth refusing.
 *
 * Zero and negatives are dropped rather than kept: unlike a length or a
 * clearance, a pipe of 0" is not a measurement anybody took.
 */
WT.parseSizes = function (text) {
  var sizes = [];
  String(text == null ? '' : text)
    .split(/[&,;/+]|\band\b|\bdan\b/i)
    .forEach(function (part) {
      var value = WT.parseNumber(part);
      if (value != null && value > 0) sizes.push(value);
    });
  return sizes;
};

/* -- Time -------------------------------------------------------------- */

function pad2(n) { return n < 10 ? '0' + n : String(n); }

/** "2026-09-03" -- how a day is grouped. */
WT.dateOf = function (d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};

/** "08:14:22" */
WT.timeOf = function (d) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
};

/** "2026-09-03 08:14:22" -- what is burned into the photograph. */
WT.timestampOf = function (d) {
  return WT.dateOf(d) + ' ' + WT.timeOf(d);
};

/** "20260903_081422", for the filename. */
WT.stampOf = function (d) {
  return WT.dateOf(d).replace(/-/g, '') + '_' + WT.timeOf(d).replace(/:/g, '');
};

/** Strips anything that would upset a filename or a WhatsApp attachment. */
WT.fileSafe = function (name) {
  return String(name).trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Operator';
};

window.WT = WT;
