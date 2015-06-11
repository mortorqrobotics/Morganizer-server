var http = require("http");
var url = require("url");
var qs = require("querystring");
var io = require('socket.io');
var sqlite = require("sqlite3");
var db = new sqlite.Database("sql.db");

var server = http.createServer(function(req, res) {
	var path = url.parse(req.url).pathname;
	var get = qs.parse(url.parse(req.url).querystring);
	for(var i = 0; i < actions.length; i++) {
		if(path == "/f/" + actions[i].path) {
			if(actions[i].method.toLowerCase() == "post") {
				(function() {
					var action = actions[i];
					var data = new Buffer(0);
					req.on("data", function(chunk) {
						data = Buffer.concat([data, chunk]);
					});
					req.on("end", function() {
						action.cb(req, res, get, String(data));
					});
				})();
			}
			else if(actions[i].method.toLowerCase() == "get") {
				actions[i].cb(req, res, get);
			}
		}
	}
});

var port = process.argv[2] || 8080;
server.listen(port);

var actions = [];
function addAction(path, method, cb) {
	actions.push({
		path: path,
		method: method,
		cb: cb
	});
}
var clients = [];

addAction("createuser", "POST", function(req, res, get, post){

	 	var data = post; 
	 	var user = data.user;
	 	var pass = data.pass;
	 	var email = data.email;
	 	db.serialize(function(){
	 		db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT)");
	 		db.run("INSERT INTO Users VALUES ('"+user+"', '"+pass+"', '"+email+"')");
	 	});
	 	
});
addAction("loginuser", "POST", function(req, res, get, post){

	 	var data = post; 
	 	var user = data.user;
	 	var pass = data.pass;
	 	db.serialize(function(){
	 		db.run("CREATE TABLE IF NOT EXISTS Sessions (user TEXT, token TEXT)");
	 		db.all("SELECT * FROM Users WHERE user ='" + user + "' AND pass ='"+ pass+"'", function(err, results) {
	 			if (typeof(results) != "undefined"&&results.length == 1){
	 				var token = randomStr();
	 				db.run("INSERT INTO Sessions VALUES ("+ [user, token].join(",") + ")");
					res.end(JSON.stringify({"user":user, "token":token}));
	 			}
	 			else{
	 				res.end("failed login");
	 			}
	 		});
	 	});;
});
addAction("addevent", "POST", function(req, res, get, post){

	var data = post; 
	var user = data.user;
	var token = data.token;
	//Verify user is valid
	db.serialize(function(){
		db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month TEXT, day TEXT, year TEXT, time TEXT, event TEXT)");
		db.run("INSERT INTO " + user + "_Calendar VALUES (" + [data.month, data.day, data.year, data.time, data.event].join(",") + ")");
	});
});
addAction("getevents", "POST", function(req, res, get, post){

	var data = post;
	var user = data.user;
	var token = data.token;
	//Verify user is valid
	db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month TEXT, day TEXT, year TEXT, time TEXT, event TEXT)");//Because user may get events before they add event
	var events = [];
	db.serialize(function(){
		db.all("SELECT * FROM " + user + "_Calendar", function(err, results){
			if (typeof(results) != "undefined"&&results.length >= 1){
				events = results;
			}
		}, function(){ //If this works...unknown
			res.end(JSON.stringify(events));
		});
	});
}

function validateUser(user, token, cb){
	//Fix
	db.run("SELECT * FROM Sessions WHERE user = '"+ user +"' AND token = '"+ token+ "'", function(err, results) {
		if (typeof(results) != "undefined"&&results.length == 1){
			cb(true);
		}
		else {
			cb(false);
		}
	}
}

function randomStr(){
	var str = "";
	for(var i = 0; i < 16; i++) {
		var rand = Math.floor(Math.random() * 36);
		str += String.fromCharCode(rand + ((rand < 10) ? 48 : 87));
	}
	return str;
}

io.listen(server).on("connection", function(socket) {

	socket.on("disconnect", function() {
		
	});

});