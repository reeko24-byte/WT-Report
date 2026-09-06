/* Turning a raw capture into the photograph that gets stored and sent: orient,
 * resize, stamp, compress.
 *
 * Three things are burned into the pixels, and burned in rather than drawn over
 * a preview because the pixels are the evidence. A photograph forwarded into a
 * WhatsApp group, saved by somebody else and pasted into a document months
 * later still carries all three, and nothing downstream can separate them:
 *
 *   bottom band   who walked, where, which KP, what they found, when, and the
 *                 coordinates and address it was taken at
 *   top right     the Walkthrough Surveillance mark, at a transparency that
 *                 identifies the photograph without obscuring what it shows
 *   bottom right  the verification code (see seal.js), which is what makes a
 *                 later edit of the timestamp detectable
 *
 * Behind the bottom band's text runs a diagonal micro-print of the timestamp
 * and the code, repeated. It is faint on purpose: the eye passes over it, but
 * painting a rectangle over the printed time cuts the diagonal lines and the
 * break is obvious against the rest of the band. It costs nothing and it is the
 * cheapest thing that makes a crude edit visible without any reference.
 *
 * The stamp text is fixed Indonesian/English as spelled here. It is part of the
 * report: a set of photographs from one walk must not read differently because
 * one operator's phone was set to another language.
 */

(function (WT) {

  /** The long edge every stored photo is reduced to. */
  var TARGET_MAX_DIMENSION = 1600;

  /** Roughly 400 KB per photo, enforced by stepping quality down if needed. */
  var MAX_FILE_BYTES = 400000;

  /** The list thumbnail. Decoding full photographs to draw a list is how a
      phone gets slow, and a point holds three of them. */
  var THUMB_DIMENSION = 200;

  /* -- The two numbers that decide how the logo watermark sits ---------- */

  /* How much of the frame the mark spans, and how far through it you can see.
     These are the only place either is decided -- change them here.

     0.55, raised from 0.38. The first value was judged against grass and sky,
     where the mark's white glyphs sat on their own dark shadow and read easily.
     On a photograph of a printed page it all but disappeared: pale ground, white
     text, and only a faint shadow left to carry it. The artwork now carries a
     hard dark outline too, and the opacity is set for the harder case -- a mark
     that cannot be read on a document photograph is not identifying anything. */
  var WATERMARK_OPACITY = 0.55;
  var WATERMARK_WIDTH_FRACTION = 0.30;
  var WATERMARK_SOURCE = 'assets/watermark.png';

  /* The bottom band never takes more than this much of the frame, however many
     lines it carries. A stamp that eats half the photograph stops being a stamp
     and starts being the photograph. */
  var MAX_BAND_FRACTION = 0.38;

  /* Body type, as a fraction of the frame's width. Long lines wrap rather than
     shrinking the whole block: an address is the one line that varies, and
     letting it drag every other line down to unreadable is the wrong trade. */
  var BAND_FONT_FRACTION = 0.026;

  var SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

  /* -- Decoding -------------------------------------------------------- */

  /**
   * Decodes a captured file with its EXIF rotation already applied.
   *
   * Phone photos are almost always tagged rather than physically rotated, so
   * skipping this shows every portrait capture on its side -- and the whole
   * stamp would be burned in sideways with it.
   */
  function decodeOriented(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }

  /* Safari applies EXIF orientation when it renders an <img>, so drawing one to
     a canvas gives the same result on the versions where createImageBitmap's
     imageOrientation option is missing. */
  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Foto tidak bisa dibaca'));
      };
      img.src = url;
    });
  }

  function drawScaled(source, maxDimension) {
    var width = source.width || source.naturalWidth;
    var height = source.height || source.naturalHeight;
    // Never upscale -- enlarging a small capture adds no detail and costs size.
    var scale = Math.min(maxDimension / width, maxDimension / height, 1);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function toBlob(canvas, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', quality);
    });
  }

  /** Steps quality down only if needed, rather than trusting one fixed value. */
  function compress(canvas, ceiling) {
    var quality = 0.8;
    function attempt() {
      return toBlob(canvas, quality).then(function (blob) {
        if (blob.size <= ceiling || quality <= 0.3) return blob;
        quality -= 0.1;
        return attempt();
      });
    }
    return attempt();
  }

  /* -- The logo watermark ---------------------------------------------- */

  /* Loaded once and reused. Three photographs a point, twenty points a day: a
     fetch per capture would be twenty pointless requests on a phone that
     probably has no signal anyway (the file is in the service worker's cache,
     but the decode is not free either). */
  var watermarkPromise = null;

  function loadWatermark() {
    if (watermarkPromise) return watermarkPromise;
    watermarkPromise = new Promise(function (resolve) {
      var img = new Image();
      // Resolve with null rather than reject: a missing mark is a cosmetic
      // problem, and it must never cost anyone a photograph.
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = WATERMARK_SOURCE;
    });
    return watermarkPromise;
  }

  /**
   * Draws the mark into the top right corner.
   *
   * Falls back to setting the words in type when the image will not load, so a
   * photograph is always identifiable as this app's even if the artwork has
   * been replaced with something unreadable.
   */
  function burnWatermark(canvas, mark) {
    var context = canvas.getContext('2d');
    var margin = Math.round(canvas.width * 0.025);
    var width = Math.round(canvas.width * WATERMARK_WIDTH_FRACTION);

    context.save();
    context.globalAlpha = WATERMARK_OPACITY;

    if (mark) {
      var height = Math.round(width * (mark.naturalHeight / mark.naturalWidth));
      context.drawImage(mark, canvas.width - margin - width, margin, width, height);
    } else {
      var size = Math.round(canvas.width * 0.026);
      context.font = '700 ' + size + 'px ' + SANS;
      context.textAlign = 'right';
      context.textBaseline = 'top';
      context.shadowColor = 'rgba(0, 0, 0, 0.85)';
      context.shadowBlur = size * 0.35;
      context.fillStyle = '#FFFFFF';
      context.fillText('WALKTHROUGH', canvas.width - margin, margin);
      context.fillText('SURVEILLANCE', canvas.width - margin, margin + size * 1.15);
    }

    context.restore();
  }

  /* -- The bottom band ------------------------------------------------- */

  /**
   * Repeats the timestamp and the code diagonally across the band, faintly.
   *
   * Drawn under the text, inside the band's clip. Its only job is to make a
   * paint-over of the printed time visible: the diagonal runs are continuous
   * across the whole band, so a rectangle of flat colour anywhere on it cuts
   * them and the cut is plain at a glance.
   */
  function burnMicroPrint(context, band, phrase) {
    if (!phrase) return;

    /* Micro-print, and it has to stay micro. Set any larger it competes with
       the caption it is protecting; set any fainter it survives neither the
       JPEG quality steps nor WhatsApp's own re-compression. */
    var size = Math.max(7, Math.round(band.font * 0.30));
    var step = size * 2.6;
    var repeated = new Array(40).join(phrase + '   ');

    context.save();
    context.beginPath();
    context.rect(band.left, band.top, band.width, band.height);
    context.clip();

    context.globalAlpha = 0.10;
    context.fillStyle = '#FFFFFF';
    context.font = '500 ' + size + 'px ' + MONO;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';

    context.translate(band.left, band.top);
    context.rotate(-14 * Math.PI / 180);

    /* Rotated, the band's corners reach outside its own rectangle, so the runs
       start above it and continue past its foot. The clip trims the excess. */
    var reach = band.width + band.height;
    for (var y = -band.height; y < reach; y += step) {
      context.fillText(repeated, -band.height, y);
    }

    context.restore();
  }

  /**
   * How wide the seal's block is at a given body size, plate and gutter
   * included.
   *
   * Split out from drawing it because the band has to reserve the column before
   * it knows how the text will wrap, and asking twice for the same number is
   * cheaper than guessing at it once.
   *
   * Leaves the context's font as it found it: it runs during layout, where a
   * stray font would silently change what every later measurement returns.
   */
  function sealFootprint(context, size, seal) {
    if (!seal || !seal.code) return 0;
    var metrics = sealMetrics(context, size, seal);
    return metrics.width + metrics.code * 1.6;
  }

  function sealMetrics(context, size, seal) {
    /* Sized off the body type, not off the band. It is a stamp, not a headline:
       big enough to read off a forwarded picture, small enough that nobody
       mistakes it for the subject of the photograph. */
    var codeSize = Math.round(size * 0.95);
    var labelSize = Math.round(codeSize * 0.58);
    var previous = context.font;

    context.font = '700 ' + codeSize + 'px ' + MONO;
    var codeWidth = context.measureText(seal.code).width;
    context.font = '600 ' + labelSize + 'px ' + SANS;
    var labelWidth = context.measureText(WT.seal.labelFor(seal.algo)).width;

    context.font = previous;
    return {
      code: codeSize,
      label: labelSize,
      width: Math.max(codeWidth, labelWidth)
    };
  }

  /**
   * The verification block, in the band's bottom right corner.
   *
   * Two lines: what computed the code, and the code. Set in a monospace face
   * because it is meant to be read off a photograph and typed into a search
   * box, and 0/O and 1/I have to be distinguishable when they are.
   */
  function burnSeal(context, band, seal) {
    if (!seal || !seal.code) return;

    var metrics = sealMetrics(context, band.font, seal);
    var codeSize = metrics.code;
    var labelSize = metrics.label;
    var right = band.left + band.width - band.padding;
    var bottom = band.top + band.height - band.padding * 0.7;

    context.save();
    context.textAlign = 'right';
    context.textBaseline = 'alphabetic';

    // A plate of its own, a shade darker than the band, so the code reads as a
    // stamped mark rather than as one more line of the caption.
    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(right - metrics.width - codeSize * 0.45,
      bottom - codeSize - labelSize - codeSize * 0.7,
      metrics.width + codeSize * 0.9, codeSize + labelSize + codeSize * 0.9);

    context.fillStyle = 'rgba(255, 255, 255, 0.82)';
    context.font = '600 ' + labelSize + 'px ' + SANS;
    context.fillText(WT.seal.labelFor(seal.algo), right, bottom - codeSize * 1.25);

    context.fillStyle = '#FFFFFF';
    context.font = '700 ' + codeSize + 'px ' + MONO;
    context.fillText(seal.code, right, bottom);

    context.restore();
  }

  /**
   * Draws the whole bottom band: plate, micro-print, information, seal.
   *
   * The band spans the full width rather than being sized to its longest line.
   * The seal has to sit in the bottom right corner and the information in the
   * bottom left, and one band holding both is the only arrangement where they
   * cannot collide however long a place name turns out to be.
   */
  /**
   * Breaks lines that do not fit, at word boundaries.
   *
   * The address is the line this exists for. It runs to four administrative
   * levels on a wide frame and there is no shortening it that does not throw
   * away the half that identifies the place. Wrapping costs one more row of the
   * band; shrinking the type to fit costs the legibility of every other line.
   */
  function wrapLines(context, lines, maxWidth) {
    var out = [];
    lines.forEach(function (line) {
      if (context.measureText(line).width <= maxWidth) { out.push(line); return; }

      var words = String(line).split(' ');
      var current = '';
      words.forEach(function (word) {
        var candidate = current ? current + ' ' + word : word;
        // A single word wider than the band still goes out whole: clipping it
        // mid-word would read as corruption rather than as a long name.
        if (current && context.measureText(candidate).width > maxWidth) {
          out.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      if (current) out.push(current);
    });
    return out;
  }

  function burnBand(canvas, lines, seal) {
    var context = canvas.getContext('2d');
    var timestamp = lines.timestamp || '';
    var ceiling = canvas.height * MAX_BAND_FRACTION;

    /* Type size, wrapping and band height depend on each other, so they are
       settled in two passes rather than a loop: lay the text out at the natural
       size, and if the band came out taller than its ceiling, scale once by
       exactly how much it overran and lay it out again. Two passes always
       terminate, and the second is only ever needed on a wide frame with a long
       address. */
    var fontSize = canvas.width * BAND_FONT_FRACTION;
    var layout = measure(fontSize);
    if (layout.height > ceiling) layout = measure(fontSize * (ceiling / layout.height));

    function measure(size) {
      var padding = size * 0.62;
      var lineHeight = size * 1.30;

      context.font = '600 ' + size + 'px ' + SANS;
      /* The seal is reserved out of every line, not just the ones beside it.
         It is a narrow column and the alternative — letting the upper lines run
         under it and catching the overlap per line — is a lot of arithmetic to
         save a few characters of wrap. */
      var sealWidth = seal && seal.code ? sealFootprint(context, size, seal) : 0;
      var available = canvas.width - padding * 2 - sealWidth;
      var wrapped = wrapLines(context, lines, available);

      return {
        size: size,
        padding: padding,
        lineHeight: lineHeight,
        lines: wrapped,
        height: lineHeight * wrapped.length + padding * 2
      };
    }

    var band = {
      left: 0,
      top: canvas.height - layout.height,
      width: canvas.width,
      height: layout.height,
      padding: layout.padding,
      font: layout.size
    };

    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(band.left, band.top, band.width, band.height);

    burnMicroPrint(context, band, seal && seal.code
      ? timestamp + '  ' + seal.code
      : timestamp);

    burnSeal(context, band, seal);

    context.save();
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.font = '600 ' + layout.size + 'px ' + SANS;

    // A shadow, so the text survives wherever the plate is thinnest.
    context.shadowColor = 'rgba(0, 0, 0, 0.9)';
    context.shadowBlur = 4;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 1;
    context.fillStyle = '#FFFFFF';

    layout.lines.forEach(function (line, index) {
      var baseline = band.top + layout.padding +
        (index + 1) * layout.lineHeight - layout.lineHeight * 0.28;
      context.fillText(line, layout.padding, baseline);
    });

    context.restore();
    return canvas;
  }

  /** Keeps a long line from squeezing the whole band into unreadable type. */
  function clamp(text, limit) {
    var value = String(text == null ? '' : text).trim();
    return value.length > limit ? value.slice(0, limit - 1) + '…' : value;
  }

  WT.photo = {

    WATERMARK_OPACITY: WATERMARK_OPACITY,

    /**
     * The band's lines. Blank ones are dropped, so a photo taken with no fix
     * and no signal simply carries fewer.
     *
     * The array carries the timestamp on a property as well, because the
     * micro-print needs it and picking it back out of the list by position
     * would break the first time a line is added above it.
     */
    bandLines: function (meta) {
      var team = (meta.team || []).filter(function (name) { return name; });

      /* Asked as text, not tested for null: a size is a list now, and an empty
         list is not null -- it would have appended a dangling separator. */
      var size = WT.sizeText(meta.pipeSize);

      var lines = [
        'LAPORAN TEAM WT · ' + (meta.zone || ''),
        'Segment ' + WT.segmentText(meta.segment, meta.segmentName) +
          (size ? ' · ' + size : ''),
        WT.kpText(meta.kp),
        /* Generous, because the band wraps rather than shrinks. The cap is only
           there so that a note typed at length cannot push the band to its
           ceiling and take the type size of every other line down with it. */
        clamp(meta.conditionText, 96),
        team.length ? clamp('Tim: ' + team.join(', '), 96) : '',
        meta.timestamp,
        meta.latitude == null ? ''
          : 'Lat: ' + meta.latitude.toFixed(6) + ', Long: ' + meta.longitude.toFixed(6),
        meta.addressText
      ].filter(function (line) { return line && String(line).trim(); });

      lines.timestamp = meta.timestamp || '';
      return lines;
    },

    /**
     * Raw camera file in, stored photograph out.
     *
     * Resolves to { blob, thumb, width, height }.
     *
     * `meta.seal` is what seal.js computed from the ORIGINAL file, before any
     * of this ran. It is passed in rather than computed here so that the code
     * printed on the photograph and the digest filed in the spreadsheet are the
     * same object, and cannot drift apart.
     *
     * Runs entirely on the device; nothing here needs a network.
     */
    process: function (file, meta) {
      return Promise.all([decodeOriented(file), loadWatermark()]).then(function (loaded) {
        var source = loaded[0];
        var mark = loaded[1];

        var canvas = drawScaled(source, TARGET_MAX_DIMENSION);
        var thumbCanvas = drawScaled(source, THUMB_DIMENSION);
        if (source.close) source.close();   // release the ImageBitmap now

        // The mark first, the band second: the band's plate must sit over the
        // mark where they meet, not under it.
        burnWatermark(canvas, mark);
        burnBand(canvas, WT.photo.bandLines(meta), meta.seal);

        return Promise.all([
          compress(canvas, MAX_FILE_BYTES),
          toBlob(thumbCanvas, 0.6)
        ]).then(function (results) {
          return {
            blob: results[0],
            thumb: results[1],
            width: canvas.width,
            height: canvas.height
          };
        });
      });
    }
  };
}(window.WT));
