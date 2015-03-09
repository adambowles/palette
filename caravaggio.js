// Script to search the Monet website and download all his art pieces
// 1 param usage: node caravaggio.js [pieces to download]
//   - First parameter is how many of the pieces to download
//   useful for debugging on small datasets
// 2 param usage: node caravaggio.js [first piece] [final piece]
//   - First parameter is first piece to download
//   - Second parameter is final piece to download
//   useful for downloading small datasets, to split the downloading if the entire dataset is too large for working memory
// Provide no parameters to download all pieces, used for production download

// Common functions between all modules
var functions = require('./functions.js');

// jQuery global variable (jQuery will write and rewrite to this within loops, to avoid including it ~1000 times in several local scope vars)
var $;

// Plugin imports
var fs = require('fs');
var http = require('http');
var mysql = require('mysql');
var env = require('jsdom').env;

var artist = 'Michelangelo Merisi da Caravaggio';
var database_url = 'http://www.caravaggiogallery.com/caravaggio-paintings-list.aspx';

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
  var links = $('table > tbody > tr > td:nth-child(2) > a'); // Each row ahs two links (one to the page for the art piece and one to the gallery is is physically located)
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

    // Determine whether the page exists
    if(window.document.title.trim() == 'The resource cannot be found.') {
      console.log('404 Error, aborting ' + index + '/' + total + ' ' + page_url);
      return;
    }

    // Only load jQuery once we know that the page is worth scraping
    $ = require('jquery')(window);

    // Determine whether the page is a standard gallery page or a info page (e.g. http://www.cmonetgallery.com/rouen-cathedral.aspx)
    if($('#gallery-information').length == 0) {
      console.log('Page misformed Error, aborting ' + index + '/' + total + ' ' + page_url);
      return;
    }

    console.log('Attempting ' + index + '/' + total + ' ' + page_url);

    var image = {};
    var imageObject = $('#gallery-picture').children()[0];

    // Computing related metadata
    image.id = index;
    image.artist = artist; // Name of authoring person
    image.artistSlug = image.artist.replace(/\W/g, '').trim(); // Slugified name of artist
    image.source = imageObject.src.trim(); // Absolute URI of image file
    image.filename = image.id + '-' + image.source.replace(/.*\//, '').trim(); // Filename of the piece
    image.filename = image.filename.replace('___Selected', ''); // For some reason this site adds '___Selected' to all filenames
    image.localPath = image.artistSlug + '/' + image.filename; // Local relative path for image file

    // Physical art related metadata
    image.title = $('#gallery-title > h1')[0].innerHTML.replace(/\<.+?\>/g,'').trim(); // Name of the piece
    //image.title = cleanTitle(image.title, image.artist); // Name of the piece, cleaned up
    image.dateCreated = $('#gallery-information > p')[1].innerHTML.trim(); // Date the piece was originally created
    //image.dateCreated = cleanDate(image.dateCreated); // Date in ISO format
    image.medium = $('#gallery-information > p')[0].innerHTML.trim(); // Type of paint, etc

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
