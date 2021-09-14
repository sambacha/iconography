const path = require('path');
 const svgToMiniDataURI = require('mini-svg-data-uri');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
      {
        test: /\.svg/,
        type: 'asset/inline',
       generator: {
         dataUrl: content => {
           content = content.toString();
           return svgToMiniDataURI(content);
         }
       }
      }
    ]
  },
};
