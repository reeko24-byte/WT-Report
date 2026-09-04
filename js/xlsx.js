/* Writes a real .xlsx -- photographs embedded, not linked -- with no library.
 *
 * An .xlsx is a zip of XML parts. Writing it by hand rather than pulling in a
 * spreadsheet library buys two things that matter here: the app keeps working
 * offline forever with nothing to fetch, and every picture anchor is set in EMU
 * directly, so each photograph lands where and at the size it should.
 *
 * The column layout must not drift:
 *
 *   A Tanggal        B Waktu           C Location        D Segment
 *   E Nama Segment   F KP              G Penugasan From  H Penugasan To
 *   I Size Pipe      J Kondisi         K Note            L Tim
 *   M Pelapor        N O P Photo 1-3
 *   Q..T   Waktu / Kode / Lat / Long for photo 1
 *   U..X   the same for photo 2
 *   Y..AB  the same for photo 3
 *
 * PENUGASAN IS SPLIT ACROSS TWO COLUMNS, the way ROWPowerline splits its
 * location range: the office sorts and filters on the ends of a stretch
 * separately, and a single "00 +000 - 12 +820" cell can do neither.
 *
 * FOUR COLUMNS PER PHOTOGRAPH, not one set per row. Three shots of one point
 * are taken minutes and tens of metres apart, and a picture chosen from the
 * gallery may carry a time from another day or no position at all -- one time
 * and one pair of coordinates for the whole row could only ever have been right
 * about one of them.
 *
 * KODE IS THE POINT OF THE WHOLE FILE. It is the verification code printed in
 * the corner of that photograph (see seal.js). This sheet is the register it is
 * checked against: read the code off a picture, find it here, and the time
 * beside it is the time the app wrote. A picture whose printed time disagrees
 * with its row was edited after it left the phone.
 *
 * The coordinates are written as NUMBERS on Excel's General format, so they sort
 * and filter, and so Format Cells reads "General" rather than "Custom" -- which
 * is where anyone looking for a plain number expects to find it.
 *
 * Size Pipe is TEXT, and used not to be. Segment 10/12 runs a 24" and a 20" down
 * one right-of-way, and no number holds two diameters. A filter still groups the
 * sheet by pipe, which is the only thing that column was ever used for.
 */

(function (WT) {

  /* -- Picture geometry ------------------------------------------------ */

  var EMU_PER_CM = 360000;

  /* Every photograph is written at exactly this size, whatever shape it was
     taken in. Uniform is the point: a report where the pictures are all the
     same size reads as one document, and rows line up down the page. Landscape
     and portrait shots are therefore stretched to fit -- the same trade the
     ARROW and ROWPowerline reports make.

     These two numbers are the only place the picture size is decided. */
  var PHOTO_WIDTH_CM = 5.0;
  var PHOTO_HEIGHT_CM = 3.75;

  var PHOTO_WIDTH_EMU = Math.round(PHOTO_WIDTH_CM * EMU_PER_CM);
  var PHOTO_HEIGHT_EMU = Math.round(PHOTO_HEIGHT_CM * EMU_PER_CM);

  /* A hair of inset so a picture doesn't sit on the cell's gridline. */
  var INSET_EMU = 19050;                                            // 2 px

  /* Row tall enough to hold the picture plus both insets, in points. */
  var ROW_HEIGHT_PT = Math.ceil((PHOTO_HEIGHT_CM / 2.54) * 72 + 4); // 111

  /* Column width is in characters. At Calibri 11 a column of width w is
     w * 7 + 5 pixels wide, and a pixel is 2.54/96 cm. This is the width that
     gives the picture a little room on both sides. */
  var PHOTO_COLUMN_WIDTH = Math.round(
    ((PHOTO_WIDTH_CM + 0.15) / 2.54 * 96 - 5) / 7 * 10) / 10;       // 27.1

  var HEADERS = [
    'Tanggal', 'Waktu', 'Location', 'Segment', 'Nama Segment', 'KP',
    'Penugasan From', 'Penugasan To',
    'Size Pipe', 'Kondisi', 'Note', 'Tim', 'Pelapor',
    'Photo 1', 'Photo 2', 'Photo 3',
    'Waktu Foto 1', 'Kode Foto 1', 'Lat 1', 'Long 1',
    'Waktu Foto 2', 'Kode Foto 2', 'Lat 2', 'Long 2',
    'Waktu Foto 3', 'Kode Foto 3', 'Lat 3', 'Long 3'
  ];

  /* 0-based. The three picture columns, then the first of the four-column
     blocks that follow one per photograph. */
  var FIRST_PHOTO_COLUMN = 13;
  var FIRST_META_COLUMN = 16;
  var META_STRIDE = 4;

  var STYLE_TEXT = 2, STYLE_CENTER = 3, STYLE_NUMBER = 4;

  var COLUMN_WIDTHS = [
    12, 10, 12, 10, 20, 11, 15, 15, 13, 24, 46, 34, 20,
    PHOTO_COLUMN_WIDTH, PHOTO_COLUMN_WIDTH, PHOTO_COLUMN_WIDTH,
    19, 17, 12, 12,
    19, 17, 12, 12,
    19, 17, 12, 12
  ];

  var COLUMN_STYLES = [
    STYLE_CENTER,   // A Tanggal
    STYLE_CENTER,   // B Waktu
    STYLE_CENTER,   // C Location
    STYLE_CENTER,   // D Segment -- an identifier, reads better centred
    STYLE_TEXT,     // E Nama Segment
    STYLE_CENTER,   // F KP
    STYLE_CENTER,   // G Penugasan From
    STYLE_CENTER,   // H Penugasan To
    STYLE_CENTER,   // I Size Pipe -- text: 10/12 carries two diameters
    STYLE_TEXT,     // J Kondisi
    STYLE_TEXT,     // K Note
    STYLE_TEXT,     // L Tim
    STYLE_TEXT,     // M Pelapor
    STYLE_TEXT, STYLE_TEXT, STYLE_TEXT,                 // N O P pictures
    STYLE_CENTER, STYLE_CENTER, STYLE_NUMBER, STYLE_NUMBER,
    STYLE_CENTER, STYLE_CENTER, STYLE_NUMBER, STYLE_NUMBER,
    STYLE_CENTER, STYLE_CENTER, STYLE_NUMBER, STYLE_NUMBER
  ];

  /* -- Text helpers ---------------------------------------------------- */

  function columnLetter(index) {
    var letter = '';
    index += 1;
    while (index > 0) {
      var remainder = (index - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      index = Math.floor((index - 1) / 26);
    }
    return letter;
  }

  /* Excel refuses to open a file containing control characters, and text typed
     on a phone can pick one up. Strip them rather than produce a file that
     opens with a repair dialog. */
  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function utf8(text) { return new TextEncoder().encode(text); }

  function bytesOf(blob) {
    if (blob.arrayBuffer) {
      return blob.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(blob);
    });
  }

  /* -- ZIP (stored, no compression) ------------------------------------ */

  /* Photographs are already JPEG and the XML is small next to them, so deflate
     would cost real CPU on a phone for a percent or two. Stored entries are
     ordinary zip entries and Excel reads them without complaint. */

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }());

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date) {
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  /** entries: [{ name: string, data: Uint8Array }] -> Blob */
  function zip(entries, now) {
    var stamp = dosDateTime(now || new Date());
    var prepared = entries.map(function (entry) {
      var nameBytes = utf8(entry.name);
      return { nameBytes: nameBytes, data: entry.data, crc: crc32(entry.data) };
    });

    var total = 0;
    prepared.forEach(function (entry) {
      total += 30 + entry.nameBytes.length + entry.data.length;  // local header
      total += 46 + entry.nameBytes.length;                      // central
    });
    total += 22;                                                 // end record

    var buffer = new ArrayBuffer(total);
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);
    var offset = 0;

    prepared.forEach(function (entry) {
      entry.offset = offset;
      view.setUint32(offset, 0x04034B50, true);        offset += 4;
      view.setUint16(offset, 20, true);                offset += 2;  // version needed
      view.setUint16(offset, 0x0800, true);            offset += 2;  // UTF-8 names
      view.setUint16(offset, 0, true);                 offset += 2;  // stored
      view.setUint16(offset, stamp.time, true);        offset += 2;
      view.setUint16(offset, stamp.date, true);        offset += 2;
      view.setUint32(offset, entry.crc, true);         offset += 4;
      view.setUint32(offset, entry.data.length, true); offset += 4;
      view.setUint32(offset, entry.data.length, true); offset += 4;
      view.setUint16(offset, entry.nameBytes.length, true); offset += 2;
      view.setUint16(offset, 0, true);                 offset += 2;  // no extra
      bytes.set(entry.nameBytes, offset);              offset += entry.nameBytes.length;
      bytes.set(entry.data, offset);                   offset += entry.data.length;
    });

    var centralStart = offset;
    prepared.forEach(function (entry) {
      view.setUint32(offset, 0x02014B50, true);        offset += 4;
      view.setUint16(offset, 20, true);                offset += 2;  // version made by
      view.setUint16(offset, 20, true);                offset += 2;  // version needed
      view.setUint16(offset, 0x0800, true);            offset += 2;
      view.setUint16(offset, 0, true);                 offset += 2;
      view.setUint16(offset, stamp.time, true);        offset += 2;
      view.setUint16(offset, stamp.date, true);        offset += 2;
      view.setUint32(offset, entry.crc, true);         offset += 4;
      view.setUint32(offset, entry.data.length, true); offset += 4;
      view.setUint32(offset, entry.data.length, true); offset += 4;
      view.setUint16(offset, entry.nameBytes.length, true); offset += 2;
      view.setUint16(offset, 0, true);                 offset += 2;  // extra
      view.setUint16(offset, 0, true);                 offset += 2;  // comment
      view.setUint16(offset, 0, true);                 offset += 2;  // disk
      view.setUint16(offset, 0, true);                 offset += 2;  // internal attrs
      view.setUint32(offset, 0, true);                 offset += 4;  // external attrs
      view.setUint32(offset, entry.offset, true);      offset += 4;
      bytes.set(entry.nameBytes, offset);              offset += entry.nameBytes.length;
    });

    var centralSize = offset - centralStart;

    view.setUint32(offset, 0x06054B50, true);        offset += 4;  // end of central dir
    view.setUint16(offset, 0, true);                 offset += 2;  // this disk
    view.setUint16(offset, 0, true);                 offset += 2;  // disk with central dir
    view.setUint16(offset, prepared.length, true);   offset += 2;  // entries on this disk
    view.setUint16(offset, prepared.length, true);   offset += 2;  // entries total
    view.setUint32(offset, centralSize, true);       offset += 4;
    view.setUint32(offset, centralStart, true);      offset += 4;
    view.setUint16(offset, 0, true);                 offset += 2;  // no comment

    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* -- Workbook parts -------------------------------------------------- */

  var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  function contentTypes() {
    return XML_DECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
      '</Types>';
  }

  function rootRels() {
    return XML_DECL +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
  }

  function workbook() {
    return XML_DECL +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Walkthrough" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>';
  }

  function workbookRels() {
    return XML_DECL +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';
  }

  function styles() {
    return XML_DECL +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      /* No <numFmts> block at all. Every number here sits on General, which
         shows the stored value as it is and files under "General" in Format
         Cells -- rather than under "Custom", which is where a hand-written
         format code puts it and where nobody looks for a plain number. */
      '<fonts count="2">' +
        '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border>' +
          '<left style="thin"><color rgb="FFBFBFBF"/></left>' +
          '<right style="thin"><color rgb="FFBFBFBF"/></right>' +
          '<top style="thin"><color rgb="FFBFBFBF"/></top>' +
          '<bottom style="thin"><color rgb="FFBFBFBF"/></bottom>' +
          '<diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
          '<alignment vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="right" vertical="center"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function inlineCell(reference, styleIndex, text) {
    if (text === '' || text == null) {
      return '<c r="' + reference + '" s="' + styleIndex + '"/>';
    }
    return '<c r="' + reference + '" s="' + styleIndex + '" t="inlineStr">' +
      '<is><t xml:space="preserve">' + xmlEscape(text) + '</t></is></c>';
  }

  /* An empty numeric cell is left genuinely empty rather than written as 0: a
     photograph that carried no position must not read as one taken at the
     equator. */
  function numberCell(reference, styleIndex, value) {
    if (value == null || value === '' || isNaN(value)) {
      return '<c r="' + reference + '" s="' + styleIndex + '"/>';
    }
    return '<c r="' + reference + '" s="' + styleIndex + '"><v>' +
      String(Number(value)) + '</v></c>';
  }

  /** rows: arrays of HEADERS.length values, in the column order above. */
  function sheet(rows) {
    var lastColumn = columnLetter(HEADERS.length - 1);

    var xml = XML_DECL +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + lastColumn + (rows.length + 1) + '"/>' +
      /* The header stays put while scrolling a day's photographs, and so do the
         six columns that say which point a row is -- without that, scrolling
         out to the verification codes leaves a screen of hex with nothing to
         say which row it belongs to. */
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane xSplit="6" ySplit="1" topLeftCell="G2" activePane="bottomRight" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>';

    xml += '<cols>';
    COLUMN_WIDTHS.forEach(function (width, index) {
      xml += '<col min="' + (index + 1) + '" max="' + (index + 1) +
             '" width="' + width + '" customWidth="1"/>';
    });
    xml += '</cols><sheetData>';

    xml += '<row r="1" ht="26" customHeight="1">';
    HEADERS.forEach(function (header, index) {
      xml += inlineCell(columnLetter(index) + '1', 1, header);
    });
    xml += '</row>';

    rows.forEach(function (values, rowIndex) {
      var rowNumber = rowIndex + 2;
      xml += '<row r="' + rowNumber + '" ht="' + ROW_HEIGHT_PT + '" customHeight="1">';
      values.forEach(function (value, columnIndex) {
        var reference = columnLetter(columnIndex) + rowNumber;
        var style = COLUMN_STYLES[columnIndex];
        xml += style === STYLE_NUMBER
          ? numberCell(reference, style, value)
          : inlineCell(reference, style, value);
      });
      xml += '</row>';
    });

    xml += '</sheetData>';
    // An autofilter over the header, so Kondisi and Segment can be filtered
    // without anybody having to set one up first.
    xml += '<autoFilter ref="A1:' + lastColumn + (rows.length + 1) + '"/>';
    xml += '<drawing r:id="rId1"/></worksheet>';
    return xml;
  }

  function sheetRels() {
    return XML_DECL +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' +
      '</Relationships>';
  }

  /**
   * One anchor per photograph, pinned to its own cell.
   *
   * oneCellAnchor fixes the top-left corner to a cell and then states the size
   * outright, so every picture is the same size regardless of the shape it was
   * shot in or what anyone later does to the column width.
   */
  function drawing(placements) {
    var xml = XML_DECL +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';

    placements.forEach(function (placement, index) {
      xml +=
        '<xdr:oneCellAnchor>' +
          '<xdr:from>' +
            '<xdr:col>' + placement.column + '</xdr:col>' +
            '<xdr:colOff>' + INSET_EMU + '</xdr:colOff>' +
            '<xdr:row>' + placement.row + '</xdr:row>' +
            '<xdr:rowOff>' + INSET_EMU + '</xdr:rowOff>' +
          '</xdr:from>' +
          '<xdr:ext cx="' + PHOTO_WIDTH_EMU + '" cy="' + PHOTO_HEIGHT_EMU + '"/>' +
          '<xdr:pic>' +
            '<xdr:nvPicPr>' +
              '<xdr:cNvPr id="' + (index + 2) + '" name="Photo ' + (index + 1) +
                '" descr="' + xmlEscape(placement.description) + '"/>' +
              '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>' +
            '</xdr:nvPicPr>' +
            '<xdr:blipFill>' +
              '<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
                ' r:embed="rId' + (index + 1) + '"/>' +
              '<a:stretch><a:fillRect/></a:stretch>' +
            '</xdr:blipFill>' +
            '<xdr:spPr>' +
              '<a:xfrm><a:off x="0" y="0"/>' +
              '<a:ext cx="' + PHOTO_WIDTH_EMU + '" cy="' + PHOTO_HEIGHT_EMU + '"/></a:xfrm>' +
              '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
            '</xdr:spPr>' +
          '</xdr:pic>' +
          '<xdr:clientData/>' +
        '</xdr:oneCellAnchor>';
    });

    return xml + '</xdr:wsDr>';
  }

  function drawingRels(count) {
    var xml = XML_DECL +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (var i = 1; i <= count; i++) {
      xml += '<Relationship Id="rId' + i +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"' +
        ' Target="../media/image' + i + '.jpeg"/>';
    }
    return xml + '</Relationships>';
  }

  /* -- The public call ------------------------------------------------- */

  WT.xlsx = {
    HEADERS: HEADERS,
    PHOTO_WIDTH_CM: PHOTO_WIDTH_CM,
    PHOTO_HEIGHT_CM: PHOTO_HEIGHT_CM,

    /**
     * Builds the workbook from stored points.
     *
     * Each point contributes one row and up to three embedded photographs. A
     * point whose photos are somehow missing still gets its row -- the reading
     * is the record, and dropping the row silently would be far worse than a
     * gap in the picture columns.
     */
    build: function (records, onProgress) {
      var rows = [];
      var placements = [];
      var photoBlobs = [];

      records.forEach(function (record) {
        var row = [
          record.date || '',
          record.time || '',
          record.zone || '',
          record.segment || '',
          record.segmentName || '',
          WT.kpPrint(record.kp),
          // The two ends of the assigned stretch, each in its own column.
          WT.kpPrint(record.assignFrom),
          WT.kpPrint(record.assignTo),
          /* Written as TEXT -- '8"', or '24" & 20"' for segment 10/12, which
             runs two pipes down one right-of-way. It was a number until that
             segment was merged back into one, and no number can hold two
             diameters. Nothing is lost: a filter still groups the sheet by pipe,
             and summing diameters was never a thing anyone would do. */
          WT.sizeText(record.pipeSize),
          record.conditionLabel || '',
          record.note || '',
          /* THE WHOLE CREW, reporter included -- the same names, in the same
             order, as the ticks on the WhatsApp report. This column used to
             hold the crew minus the reporter, on the reasoning that Pelapor
             named them already; but nobody reads two columns to count a team,
             and a two-man walk read as one man. Pelapor stays, because who
             filed the report is a separate question from who walked. */
          WT.teamNames(record).join(', '),
          record.reporter || '',
          '', '', ''            // L, M, N hold pictures, not text
        ];

        /* One block of four per photograph, in the same order as the picture
           columns, so "Kode Foto 2" belongs to Photo 2. A photo without a
           position leaves its pair empty rather than borrowing its
           neighbour's. */
        var photos = (record.photos || []).slice(0, WT.OPTIONS.MAX_PHOTOS);
        for (var slot = 0; slot < WT.OPTIONS.MAX_PHOTOS; slot++) {
          var photo = photos[slot];
          var at = FIRST_META_COLUMN + slot * META_STRIDE;
          row[at] = photo ? (photo.takenAt || '') : '';
          /* The full digest would be 64 characters of hex in a column nobody
             could read. The printed code is what is on the photograph and what
             gets compared; the digest it came from is kept on the record for
             anyone who needs to recompute it. */
          row[at + 1] = photo ? (photo.sealCode || '') : '';
          row[at + 2] = photo ? photo.latitude : null;
          row[at + 3] = photo ? photo.longitude : null;
        }

        rows.push(row);

        var rowIndex = rows.length;   // 0-based for the drawing: header is row 0
        photos.forEach(function (photo, index) {
          if (!photo || !photo.blob) return;
          placements.push({
            row: rowIndex,
            column: FIRST_PHOTO_COLUMN + index,
            description: 'Segment ' +
              WT.segmentText(record.segment, record.segmentName) + ' ' +
              WT.kpText(record.kp) + ' — foto ' + (index + 1)
          });
          photoBlobs.push(photo.blob);
        });
      });

      var entries = [
        { name: '[Content_Types].xml', data: utf8(contentTypes()) },
        { name: '_rels/.rels', data: utf8(rootRels()) },
        { name: 'xl/workbook.xml', data: utf8(workbook()) },
        { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels()) },
        { name: 'xl/styles.xml', data: utf8(styles()) },
        { name: 'xl/worksheets/sheet1.xml', data: utf8(sheet(rows)) },
        { name: 'xl/worksheets/_rels/sheet1.xml.rels', data: utf8(sheetRels()) },
        { name: 'xl/drawings/drawing1.xml', data: utf8(drawing(placements)) },
        { name: 'xl/drawings/_rels/drawing1.xml.rels', data: utf8(drawingRels(photoBlobs.length)) }
      ];

      // Photos are read one at a time. Reading them all at once would hold two
      // copies of every picture in memory at the peak, on the device least able
      // to spare it -- and here there are three per point.
      return photoBlobs.reduce(function (chain, blob, index) {
        return chain.then(function () {
          if (onProgress) onProgress(index, photoBlobs.length);
          return bytesOf(blob).then(function (data) {
            entries.push({ name: 'xl/media/image' + (index + 1) + '.jpeg', data: data });
          });
        });
      }, Promise.resolve()).then(function () {
        if (onProgress) onProgress(photoBlobs.length, photoBlobs.length);
        return zip(entries);
      });
    }
  };
}(window.WT));
