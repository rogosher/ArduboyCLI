module.exports = edit
edit.usage = 'arduboy edit <pkg>[@<version>]'

edit.completion = require('./utils/completion/installed-shallow.js')

var arduboy = require('./arduboy.js')
var path = require('path')
var fs = require('graceful-fs')
var editor = require('editor')

function edit (args, cb) {
  var p = args[0]
  if (args.length !== 1 || !p) return cb(edit.usage)
  var e = arduboy.config.get('editor')
  if (!e) {
    return cb(new Error(
      "No editor set.  Set the 'editor' config, or $EDITOR environ."
    ))
  }
  p = p.split('/')
       .join('/node_modules/')
       .replace(/(\/node_modules)+/, '/node_modules')
  var f = path.resolve(arduboy.dir, p)
  fs.lstat(f, function (er) {
    if (er) return cb(er)
    editor(f, { editor: e }, function (er) {
      if (er) return cb(er)
      arduboy.commands.rebuild(args, cb)
    })
  })
}
