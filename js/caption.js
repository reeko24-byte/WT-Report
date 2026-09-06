/* The WhatsApp report.
 *
 * This is the deliverable. The photographs are evidence for it and the
 * spreadsheet is a record of it, but this text is what the group actually
 * reads, and its shape is the approved one:
 *
 *   LAPORAN TEAM WT
 *   ✅ Ari Kurniawan
 *   ✅ Nurdianto
 *   Location  : South Area
 *   Segment   : 4(KOTA BATAK-KBJ)
 *   KP        : 25 + 666
 *   Size Pipe : 8"
 *   Note      : Area ROW saat ini terpantau aman dan tidak ada indikasi yg mencurigakan.
 *
 * Four things are deliberate.
 *
 * THE COLONS LINE UP, and the padding that does it is COMPUTED, not typed. Every
 * label is padded to the longest one, so renaming a label or adding a line can
 * never leave the block half-aligned -- which is exactly what had happened to
 * the hand-spaced version this replaced.
 *
 * It lines up exactly in the app's preview and in anything monospaced. WhatsApp
 * itself sets messages in a proportional font, where equal numbers of characters
 * are not equal widths, so there the colons land close together rather than in a
 * dead-straight column. Nothing a plain message can do changes that, short of
 * wrapping the whole report in a code block -- which would change how every
 * other part of it reads.
 *
 * EVERY NAME GETS A TICK. The reporter first, then whoever walked with them, in
 * the order they were picked. One line each, no commas: the group counts the
 * ticks to see how many people were out.
 *
 * THE NOTE IS A WHOLE SENTENCE, not the chip that was tapped. "Area ROW
 * Terpantau Aman" is what the operator taps and what the spreadsheet counts;
 * the report gets the sentence that belongs to it. For "Lainnya" the sentence
 * is whatever was typed.
 *
 * THERE IS NO TIMESTAMP LINE. WhatsApp stamps the message itself, and the
 * approved shape has no such line. The time is burned into the photographs and
 * written into the spreadsheet, where it cannot be lost.
 */

(function (WT) {

  var TITLE = 'LAPORAN TEAM WT';

  /* The labels, in the order they are printed. Their widths are not written
     down anywhere -- the padding below is measured from this list, so this is
     the only place a label is decided. */
  var LABEL_LOCATION = 'Location';
  var LABEL_SEGMENT  = 'Segment';
  var LABEL_KP       = 'KP';
  var LABEL_SIZE     = 'Size Pipe';
  var LABEL_NOTE     = 'Note';

  var LABELS = [LABEL_LOCATION, LABEL_SEGMENT, LABEL_KP, LABEL_SIZE, LABEL_NOTE];

  var WIDTH = LABELS.reduce(function (widest, label) {
    return Math.max(widest, label.length);
  }, 0);

  var TICK = '✅ ';

  function pad(label) {
    var out = label;
    while (out.length < WIDTH) out += ' ';
    return out;
  }

  function line(label, value) {
    return pad(label) + ' : ' + (value || '-');
  }

  WT.caption = {

    TITLE: TITLE,

    /** The tick list: the reporter, then the rest of the crew. */
    teamLines: function (record) {
      return WT.teamNames(record).map(function (name) { return TICK + name; });
    },

    /**
     * Builds the report for one point.
     *
     * A missing value is written as "-" rather than left as a dangling colon,
     * so a line that was never filled in reads as an omission instead of as a
     * formatting fault in the app.
     */
    build: function (record) {
      var lines = [TITLE].concat(WT.caption.teamLines(record));

      lines.push(line(LABEL_LOCATION, record.zone));
      lines.push(line(LABEL_SEGMENT,
        WT.segmentText(record.segment, record.segmentName)));
      // kpPrint, not the raw KP: the space before the plus is the report's, and
      // this is the report.
      lines.push(line(LABEL_KP, WT.kpPrint(record.kp)));
      lines.push(line(LABEL_SIZE, WT.sizeText(record.pipeSize)));
      lines.push(line(LABEL_NOTE, (record.note || '').trim()));

      return lines.join('\n');
    }
  };
}(window.WT));
