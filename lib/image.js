exports = module.exports = image
exports.generateCheckerboard = generateCheckerboard

var debug = require('debug')('gm')
var log = require('npmlog')
var arduboy = require('./arduboy.js')
var usage = require('./utils/usage')
var read = require('read')
var gm = require('gm').subClass({imageMagick: true})
var fs = require('fs')
var mkdir = require('mkdirp')

var path = require('path')

var jimp = require('jimp')

var exec = require('child_process').exec

var imageMagick = true

exec('convert -version', function (err, stdout, stderr) {
  if (err) imageMagick = false
})

image.usage = usage(
    'arduboy image test',
    'arduboy image tobytes [--input=filename] [--output=filename]'
)

image.subcommands = ['convert', 'test', 'tobytes']

image.completion = function (opts, cb) {
  var argv = opts.conf.argv.remain
  if (argv.length === 2) {
    return cb(null, image.subcommands)
  }

  switch (argv[2]) {
    default:
      return cb(new Error(argv[2] + ' not recognized'))
  }
}

function image (args, cb) {
  var action = args.shift()
  var params

  switch (action) {
    case 'test': return test(cb)
    case 'tobytes': return _toBytes(arduboy.config.get('input'), cb)
    default: return unknown(action, cb)
  }
}

function toBytes (args, cb) {
  var output = './tmp/converted_output.pbm'
  gm(args)
  .identify(function (err, val) {
    if (err) return cb(err)
    debug(val.toString())
  })

  gm(args)
  .setFormat('PBM')
  .bitdepth(1)
  .colors(2)
  .compress('None')
  .toBuffer(function (err, buf) {
    if (err) return cb(err)

    debug('\n' + buf.toString())
    debug(buf)

    fs.writeFile(output, buf, function(err) {
      if (err) return cb(err)
      log.info("Created " + output)
    })

    var buf_ = parseImgBuffer(buf)

    debug(buf_)
    printCCompat(buf_, path.basename(args).split('.')[0])
    return cb()
  })
}

function _toBytes (args, cb) {
  var output = './tmp/_converted_output.png'
  var image

  jimp.read(args, function (err, image) {
    if (err) return cb(err)

    var cutoff = 255
    var byteWidth = 8
    var colorWidth = 4
    var bitString = ''
    var byteArray = []
    var data = image.bitmap.data
    var width = image.bitmap.width
    var height = image.bitmap.height
    var offset = 0

    var i, j, k, c = 0

    for (i = 0; i < Math.ceil(height/byteWidth); i++) {
      for (j = 0; j < width; j++) {
        bitString = ''
        for (k = 0; k < byteWidth; k++) {
          offset = colorWidth * (width * (i * byteWidth + k) + j)

          bit = 0
          if (data[offset + colorWidth - 1] === 255) {
            for (c = 0; c < colorWidth - 1; c++) {
              if (data[offset + c] < cutoff)
                break
              if (c === colorWidth - 2) bit = 1
            }
          }
          bitString = '' + bit + bitString
        }
        debug(bitString)
        byteArray.push(formatByte(bitString))
      }
    }
    debug(byteArray)
    printCCompat(byteArray, path.basename(args).split('.')[0])
  })

  return cb()
}

/**
 * printCCompat
 * @param buffer
 * @param objectName
 *
 * Formats and prints a C compatibale defintion to stdout.
 * `aduboy tobytes --input=afile.png > afile.c`
 */
function printCCompat(buf) {
  var objectName = 'nameMe'
  var warningMessage =`Printing to standard output.
     Use a redirect to output to a file:
       arduboy image tobytes --input=afile.png > cfile.c`

  // set the object name to an argument, if provied
  if (typeof arguments[1] !== 'undefined') objectName = arguments[1]

  if (process.stdout.isTTY) {
    log.warn(warningMessage)
    log.info('----- Start Output -----')
  }

  process.stdout.write('const static unsigned char ' + objectName + ' PROGMEM = \n{\n  ')
  for (var i = 0; i < buf.length; i++) {
    process.stdout.write(buf[i] + (buf.length !== i+1 ? ',' : ''))
    if ((i+1) > 0 && (i+1) % 8 === 0) {
      process.stdout.write('\n')
      if (i+1 !== buf.length)
        process.stdout.write('  ')
    }
  }
  process.stdout.write('}\n')
  if (process.stdout.isTTY)
    log.info('------ End Output ------')
}

function parseImgBuffer() {
  if (arguments.length < 1) return

  var arr = new Uint8Array(arguments[0])

  if (arr.length < 1 || arr[0] !== 80 && arr[1] !== 49)
    return

  var barr = []

  var offset = 0    // array offset
  var pflag = false // flag for parsing magic number
  var height = ''   // image height
  var width = ''    // image width
  var i = 0         // iterator
  var m = 8         // width of a byte
  var aByte = ''    // a byte used for processing

loop:
  for (i = 3; i < arr.length; i++) {
    if (pflag === true) {
      if (arr[i] === 10) break loop
      height = height + (arr[i] - 48)
    }
    else {
      if (arr[i] === 32) {
        pflag = true
        continue loop
      }
      width = width + (arr[i] - 48)
    }
  }


  // push needed characters to new array
  for (i += 1; i < arr.length; i++) {
    if (arr[i] === 48 || arr[i] === 49)
      barr.push(arr[i])
  }


  // parse bitstring array
  // PBM file format stores white values with 0 and black with 1, adjust
  // for LED display.
  var offset         // array offset to find byte
  var bit            // a bit to be pushed to a byte
  var k              // iterator for pushing bits to a byte
  var byteArray = [] // final array of bytes

  // Determine how many rows of bytes are needed and fill each
  for (i = 0; i < Math.ceil(height/m); i++) {
    // Walk through our columns for each byte row and parse 8 into a byte
    for (j = 0; j < width; j++) {
      k = 0       // reset the bit counter
      aByte = ''  // ensure strings a string used
      while (k < m) {
        offset = i*width*m + k*width + j
        if (typeof barr[offset] !== 'undefined') {
          bit = barr[offset] - 48 // adjust value to 0 and 1
          bit ^= 1                // invert the bit to compensate for PBM format
        }
        else
          bit = 0   // if the image provides no data, fill with a 0
        aByte = '' + bit + aByte
        k++
      }

      aByte = parseInt(aByte, 2).toString(16)   // put the bitstring in base 16

      // Add '0x' prefix, pad with '0' if needed, and add a comma before
      // pushing to byte array
      byteArray.push(formatByte(aByte))
    }
  }
  return byteArray
}

function formatByte(bitString) {
  bitString = parseInt(bitString, 2).toString(16)
  return '0x' + (bitString.length === 1 ? '0' : '') + bitString
}

/**
 * perform the test sub-command
 */
function test (cb) {
  if (!imageMagick) throw 'Tests cannot be run without ImageMagick!' 
  tmpdir = './tmp'
  mkdir(tmpdir, function(err) {
    if (err) return cb(err)
  })
  generateDemonstration(cb)
  generateSinglePixel(cb)
  generateCheckerboard(cb,8,8)
  generateTestImage(cb)
  generateColorImage(cb)
  cb()
}

// The following variables are a set of procedurs to create test images for
// development.
var generateSinglePixel = function generateSinglePixel(cb) {
  var output = './tmp/single_pixel.ppm'
  gm(1,1, '#FFFFFF')
  .write(output, function (err) {
    if (err) return cb(err)
    log.info( 'Created: ' + output )
  })
}

var generateDemonstration = function generateDemonstration(cb) {
  var m = 10
  var n = 10

  mkdir('./tmp/demo', function(err) {
    if (err) return cb(err)
  })

  for (var i = 1; i <= m; i++) {
    for (var j = 1; j <= n; j++) {
      gm(i, j, '#ffffff')
      .colors(2)
      .compress('None')
      .setFormat('PBM')
      .write(('./tmp/demo/demo_' + i + 'x' + j + '.pbm'), function (err) {
        if (err) return cb(err)
      })
    }
  }

  log.info('Created: ./tmp/demo/*')
}

var generateCheckerboard = function generateSinglePixel(cb) {
  w = arguments[1]
  h = arguments[2]
  var output = './tmp/checkerboard'
  gm(w,h)
  .out('pattern:gray50')
  .colors(2)
  .compress('None')
  .toBuffer('PNG', function (err, buf) {
    if (err) return cb(err)
    debug('\n'+buf)
    fs.writeFile(output + '.png', buf, function(err) {
      if (err) return cb(err)
      log.info('Created: ' + output + '.png')
    })
  })

  gm(w,h)
  .out('pattern:gray50')
  .colors(2)
  .compress('None')
  .toBuffer('PBM', function (err, buf) {
    if (err) return cb(err)
    debug('\n'+buf)
    fs.writeFile(output + '.pbm', buf, function(err) {
      if (err) return cb(err)
      log.info('Created: ' + output + '.pbm')
    })
  })
}

var generateTestImage = function generateTestImage (cb) {
  var output = './tmp/test_arduboy.png'
  var fontFile = '/../vendor/fonts/press-start-2p/PressStart2p.ttf'
  gm(128, 64, '#000000')
    .stroke('#ffffff')
    .drawRectangle(28, 2, 100, 90, 2, 2)
    // screen
    .drawRectangle(32, 6, 96, 38, 2, 2)
    .drawText(36, 24, "Arduboy")
    .font(__dirname + fontFile, 8)
    // buttons
    .drawCircle(72, 65, 77, 65)
    .drawCircle(87, 60, 92, 60)
    // write image
    .write(output, function (err) {
      if (err) return cb(err)
      log.info('created: ' + output)
    })
}

var generateColorImage = function generateColorImage (cb) {
  var output = './tmp/test_color.png'
  gm(128, 64)
    .out('gradient:yellow-blue')
    .out('gradient:black-lime')
    .compose('CopyGreen')
    .out('-composite')
    .write(output, function (err) {
      if (err) return cb(err)
      log.info('created: ' + output)
    })
}

/**
 * target for calls to unkown sub-commands
 */
function unknown (action, cb) {
  cb('Image: \n' + image.usage)
}
