var config = require('./config.js');
var connectionDetails = config.connectionDetails;

module.exports = {
  cleanTitle: function(title, artist) {
    /**
     * Clean the title to remove artist name and the type of art
     * (e.g. 'Vincent van Gogh's Painter on His Way to Work, The Painting' -> 'The Painter on His Way to Work')
     * (e.g. 'Vincent van Gogh's Pair of Shoes, A Painting' -> 'A Pair of Shoes')
     */
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
  },

  cleanDate: function(date) {
    /**
     * 'August, 1888' -> '1888-08'
     */
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
  },

  downloadImage: function(image) {
    var remoteFile = image.source;
//    var localFile = image.artistSlug + '/' + image.id + '-' + image.filename;
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
          this.writeData(image);
        });
      });

    });
  },

  writeData: function(image) {
    var connection = mysql.createConnection(connectionDetails);

    var sql = 'INSERT INTO `artatk`.`artatk_art` (`last_updated`, `artist_name`, `source_url`, `filename`, `local_path`, `painting_name`, `date_painted`, `painting_medium`) VALUES (CURRENT_TIMESTAMP, ' + connection.escape(image.artist) + ', ' + connection.escape(image.source) + ', ' + connection.escape(image.filename) + ', ' + connection.escape(image.localPath) + ', ' + connection.escape(image.title) + ', ' + connection.escape(image.dateCreated) + ', ' + connection.escape(image.medium) + ')';

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
};
