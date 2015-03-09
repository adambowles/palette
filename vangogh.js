// Script to search the Monet website and download all his art pieces
// 1 param usage: node vangogh.js [pieces to download]
//   - First parameter is how many of the pieces to download
//   useful for debugging on small datasets
// 2 param usage: node vangogh.js [first piece] [final piece]
//   - First parameter is first piece to download
//   - Second parameter is final piece to download
//   useful for downloading small datasets, to split the downloading if the entire dataset is too large for working memory
// Provide no parameters to download all pieces, used for production download

// Common functions between all modules
var functions = require('./functions.js');

// jQuery global variable (jQuery will write and rewrite to this within loops, to avoid including it ~1000 times)
var $;

// Plugin imports
var fs = require('fs');
var http = require('http');
var mysql = require('mysql');
var env = require('jsdom').env;

var artist = 'Vincent van Gogh';
var database_url = 'http://www.vangoghgallery.com/catalog/Painting/';

var argsCount = process.argv.length;
var start = -1;
var end = -1;

if (argsCount >= 3) { // Number of user submitted args
  if (argsCount == 3) { // User provides one arg: 'Get this number of images'
    start = 0;
    end = process.argv[2];
  }

  if (argsCount == 4) { // User provides two args: 'Get images from X to Y'
    start = process.argv[2];
    end = process.argv[3];
  }
}


console.log('---');
console.log('Starting download of ' + artist + '\'s works...');
console.log('Using database: ' + database_url);
console.log('---');

// First argument can be html string, filename, or url
env(database_url, function (errors, window) {
  if (errors) {
    console.log(errors);
  }

  $ = require('jquery')(window);


  var images = [];

  // Collection of the table rows that have links to art pieces
  var links = $('table.bodymainsmall > tbody > tr > td > a');
  var size = links.length;

  console.log('Found ' + size + ' pieces by ' + artist);
  console.log('Commencing parse...');
  console.log('---');

  var url;
  if (start < 0 && end < 0) {
    start = 1;
    end = size - 1;
  }

  console.log('Downloading images ' + start + '-' + end + '...');
  console.log('---');

  for (var i = start; i <= end; i++) {
    url = encodeURI(links[i].href);
    visit_page(url, i, end);
  }
});

/**
 *
 */
function visit_page(page_url, index, total) {

  env(page_url, function (errors, window) {
    if (errors) {
      console.log(errors);
    }

    $ = require('jquery')(window);

    console.log('Attempting ' + index + '/' + total + ' ' + page_url);

    var image = {};
    var imageObject = $('table > tbody > tr > td > img');

    // Computing related metadata
    var url_tokens = page_url.split('/');
    image.id = url_tokens[url_tokens.length - 2];
    image.artist = artist; // Name of authoring person
    image.artistSlug = image.artist.replace(/\W/g, ''); // Slugified name of artist
    image.source = imageObject[0].src.trim(); // Absolute URI
    image.filename = image.id + '-' + image.source.replace(/.*\//, '').trim(); // Filename of the piece
    image.localPath = image.artistSlug + '/' + image.filename; // Local relative path for image file

    // Physical art related metadata
    image.title = imageObject.attr('alt').trim(); // Name of the piece
    image.title = functions.cleanTitle(image.title, image.artist); // Name of the piece, cleaned up
    image.dateCreated = $('[itemprop="dateCreated"]')[0].innerHTML.trim(); // Date the piece was originally created
    image.dateCreated = functions.cleanDate(image.dateCreated); // Date in ISO format
    image.medium = $('[itemprop="genre"]')[0].innerHTML.trim(); // Type of paint, etc

    // Save image to disk
    fs.exists(image.localPath, function(exists) {
      if (!exists) {
        functions.downloadImage(image);
      } else {
        console.log('Skipping file; already present: ' + image.localPath);
      }
    });

    // Pages stay in memory until script ends, so destroy all elements on page.
    //TODO better way of doing this?
    $('*').html('');

  });

}
