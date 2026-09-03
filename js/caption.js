/* The WhatsApp report.
 *
 * This is the deliverable. The photographs are evidence for it and the
 * spreadsheet is a record of it, but this text is what the group actually
 * reads, and its shape is the approved one:
 *
 *   LAPORAN TEAM WT
 *   ✅ Ari Kurniawan
 *   ✅ Nurdianto
 *   📍Loc          : South Area
 *   Segment      : 4(KOTA BATAK-KBJ)
 *   KP                 : 26+000
 *   Size Pipe     : 8"
 *   Note             : Area ROW saat ini terpantau aman dan tidak ada indikasi yg mencurigakan.
 *
 * Four things about it are deliberate.
 *
 * THE LABEL PADDING IS COPIED, NOT COMPUTED. The runs of spaces below are the
 * ones in the approved example, transcribed character for character. They do
 * not line the colons up -- WhatsApp renders in a proportional font, so nothing
 * would line them up -- and they are not all the same width. They are what the
 * group has been reading for months, which is worth more than tidiness. If they
 * are ever to change, they change HERE and nowhere else.
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

  /* Transcribed from the approved example. Each string is the label with its
     own trailing run of spaces; only the colon is added below. */
  var LABEL_LOC     = '📍Loc          ';
  var LABEL_SEGMENT = 'Segment      ';
  var LABEL_KP      = 'KP                 ';
  var LABEL_SIZE    = 'Size Pipe     ';
  var LABEL_NOTE    = 'Note             ';

  var TICK = '✅ ';

  function line(label, value) {
    return label + ': ' + (value || '-');
  }

  WT.caption = {

    TITLE: TITLE,

    /** The tick list: the reporter, then the rest of the crew. */
    teamLines: function (record) {
      var names = [record.reporter].concat(record.mates || []);
      return names
        .filter(function (name) { return name && String(name).trim(); })
        .map(function (name) { return TICK + String(name).trim(); });
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

      lines.push(line(LABEL_LOC, record.zone));
      lines.push(line(LABEL_SEGMENT,
        WT.segmentText(record.segment, record.segmentName)));
      lines.push(line(LABEL_KP, record.kp));
      lines.push(line(LABEL_SIZE, WT.sizeText(record.pipeSize)));
      lines.push(line(LABEL_NOTE, (record.note || '').trim()));

      return lines.join('\n');
    }
  };
}(window.WT));
