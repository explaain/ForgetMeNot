// DEPENDENCIES
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var map = require('./app/config/properties.js');

var mongoose = require('mongoose');

var apiController = require('./app/controller/chatbot');

var routes = require('./app/routes/index');
var api = require('./app/routes/api');
var users = require('./app/routes/users');
var webhooks = require('./app/routes/webhooks');

var app = express();

// MongoDB database
// mongoose.connect('mongodb://localhost/ForgetMeTest');

// view engine setup
app.set('views', path.join(__dirname, 'app', 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/api', api);
app.use('/users', users);
app.use('/webhook', webhooks);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

module.exports = app;
