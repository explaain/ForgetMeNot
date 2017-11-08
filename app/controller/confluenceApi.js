var request = require('superagent');

function Confluence(config) {
    if (!(this instanceof Confluence)) return new Confluence(config);
    if (!config) {
        throw new Error("Confluence module expects a config object.");
    }
    else if (!config.username || ! config.password) {
        throw new Error("Confluence module expects a config object with both a username and password.");
    }
    else if (!config.baseUrl) {
        throw new Error("Confluence module expects a config object with a baseUrl.");
    }
    this.config = config;
    this.config.apiPath = '/wiki/rest/api';
    this.config.extension = ''; // no extension by default
}

function processCallback(cb, err, res) {
    if (err || !res || !res.body) {
        cb(err, res);
    }
    else {
        cb(err, res.body);
    }
}

Confluence.prototype.getSiteContent = function(space, callback){
    request
        .get(this.config.baseUrl + this.config.apiPath + "/content")
        .auth(this.config.username, this.config.password)
        .end(function(err, res){
            processCallback(callback, err, res);
        });
};

module.exports = Confluence;
