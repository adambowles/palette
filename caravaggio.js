// Script to search the Monet website and download all his art pieces
// 1 param usage: node caravaggio.js [pieces to download]
//   - First parameter is how many of the pieces to download
//   useful for debugging on small datasets
// 2 param usage: node caravaggio.js [first piece] [final piece]
//   - First parameter is first piece to download
//   - Second parameter is final piece to download
//   useful for downloading small datasets, to split the downloading if the entier dataset is too large to working memory
// Provide no parameters to download all pieces, used for production download

var artist = 'Michelangelo Merisi da Caravaggio';
var database_url = 'http://www.caravaggiogallery.com/caravaggio-paintings-list.aspx';

var mysqluser = 'artatk';
var mysqlpass = 'artatk!';

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

// jQuery global variable (jQuery will write and rewrite to this within loops, to avoid including it ~1000 times in several local scope vars)
var $;

// Plugin imports
var fs = require('fs');
var http = require('http');
var mysql = require('mysql');
var env = require('jsdom').env;


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

    //console.log(JSON.stringify(image, undefined, 2));
    // Save image to disk
    fs.exists(image.localPath, function(exists) {
      if (!exists) {
        downloadImage(image);
      } else {
        console.log('Skipping file; already present: ' + image.localPath);
      }
    });

    // Pages stay in memory until script ends, so destroy all elements on page.
    //TODO better way of doing this?
    $('*').html('');

  });

}

/**
 * Clean the title to remove artist name and the type of art
 * (e.g. 'Vincent van Gogh's Painter on His Way to Work, The Painting' -> 'The Painter on His Way to Work')
 * (e.g. 'Vincent van Gogh's Pair of Shoes, A Painting' -> 'A Pair of Shoes')
 */
function cleanTitle(title, artist)
{
  title = title
            .replace(artist + '\'s ', '')
            .replace(/\s\S*$/, ''); //TODO do any names NOT have 'Painting' on the end?

  if (/,\s(A|The)$/.test(title)) {
    var article = title
                    .match(/,\s(?:A|The)$/)[0] // Get ", A" or ", The"
                    .replace(/^../, ''); // Remove the ", " from the beginning

    var body = title.replace(', ' + article, '');

    title = article + ' ' + body;
  }

  return title;
}

/**
 * 'August, 1888' -> '1888-08'
 */
function cleanDate(date) {
  var originalDate = date;

  date = date.replace(/\?/, ''); // Some dates are only best guesses, so they are marked with a '?'.
  date = date.replace(/\s+/, ' ').trim(); // Tidy up spaces

  // Lookup table to convert month names into numbers
  var months = ['', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  var month;
  var year;

  var dateContainsYear = /\d\d\d\d/.test(date);

  if (dateContainsYear) {
    year = date.match(/\d\d\d\d/)[0];
  }

  var dateContainsMonth = /\D+/.test(date);

  if (dateContainsMonth) {
    month = date.match(/\D+/)[0].replace(/, /, '');
    month = months.indexOf(month.toLowerCase());

    // Ensure all months are 2 characters long, e.g. 08, 09, 10, etc.
    if (month < 10) {
      month = '0' + month;
    }

  } else {
    month = null;
  }

  date = year + '-' + month;

  var properDate = /\d{4}-\d{2}/.test(date);

  if(properDate) {
    return date;
  } else {
    // Date was formatted funky, just return original
    return originalDate;
  }
}

/**
 *
 */
function downloadImage(image)
{
  var remoteFile = image.source;
//  var localFile = image.artistSlug + '/' + image.id + '-' + image.filename;
  var localFile = image.localPath;

  if (!fs.existsSync(image.artistSlug)){
    fs.mkdirSync(image.artistSlug);
  }

  var remoteProtocol = remoteFile.match(/.*:\/\//);
  var remoteDomain = remoteFile.replace(remoteProtocol, '').split('/')[0];
  var remotePath = remoteFile.replace(remoteProtocol, '').replace(remoteDomain, '');

  var options = {
    host: remoteDomain,
    port: 80,
    path: remotePath
  };

  var request = http.get(options, function(res){
    var imageData = '';
    res.setEncoding('binary');

    res.on('data', function(chunk){
        imageData += chunk;
    });

    res.on('end', function(){
      fs.writeFile(localFile, imageData, 'binary', function(err){
        if (err) {
          console.log('Error writing ' + localFile);
          throw err;
        }
        console.log('Downloaded file: ' + localFile);
        // Put metadata in database
        writeData(image);
      });
    });

  });
}

/**
 * Write the metadata of a piece to the mysql database
 */
function writeData(image)
{
  var connection = mysql.createConnection({
    host     : 'localhost',
    user     : mysqluser,
    password : mysqlpass,
    database : 'artatk'
  });

  var sql = 'INSERT INTO `artatk`.`artatk_art` (`artist`, `source`, `filename`, `localPath`, `title`, `dateCreated`, `medium`) VALUES (' + connection.escape(image.artist) + ', ' + connection.escape(image.source) + ', ' + connection.escape(image.filename) + ', ' + connection.escape(image.localPath) + ', ' + connection.escape(image.title) + ', ' + connection.escape(image.dateCreated) + ', ' + connection.escape(image.medium) + ')';

  connection.connect();

  connection.query(sql, function(err, rows, fields) {
    if (err) {
      console.log('Error connecting to database');
      throw err;
    }

    console.log('Metadata written for: ' + image.localPath);
  });
  connection.end();
}
