var http = require("http");
var fs = require("fs");
var url = require("url");
var qs = require("querystring");
//var io = require("socket.io");
var sqlite = require("sqlite3");
var db = new sqlite.Database("data.db");

function parseJSON(str) {
	try {
		return JSON.parse(str);
	}
	catch(ex) {}
}

var server = http.createServer(function(req, res) {
	var path = url.parse(req.url).pathname;
	var get = qs.parse(url.parse(req.url).querystring);
	var any = false;
	for(var i = 0; i < actions.length; i++) {
		if(path.toLowerCase() == ("/f/" + actions[i].path).toLowerCase()) {
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
			any = true;
			break;
		}
	}
	var found = true;
	var hidden = [".git", ".DS_Store", "LICENSE", "README.md"];
	for(var i = 0; i < hidden.length; i++) {
		if(~path.toLowerCase().indexOf(hidden[i].toLowerCase())) {
			found = false;
			break;
		}
	}
	if(!any && found) {
		path = path.replace(/\.+/, ".");
		if(path == "/") {
			path = "/index.html";
		}
		else if(!~path.indexOf(".")) {
			path += ".html";
		}
		fs.readFile("../Morganizer-website" + path, function(err, data) {
			if(err) {
				found = false;
			}
			else {
				res.end(data);
			}
		});
	}
	if(!found) {
		res.end("404");
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

addAction("createUser", "POST", function(req, res, get, post) {
	var data = parseJSON(post);
	var user = data.user;
	var pass = data.pass;
	var email = data.email;
	var subdivision = data.subdivision;
	var phone = data.phone;
	var firstName = data.firstName;
	var lastName = data.lastName;
	var token = randomStr();
	
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT, first TEXT, last TEXT, subdivision TEXT, phone TEXT)");
		db.run("INSERT INTO Users VALUES ('" + [user, pass, email, firstName, lastName, subdivision, phone].join("','") + "')");
		
		db.run("CREATE TABLE IF NOT EXISTS Sessions (user TEXT, token TEXT)");
		db.run("INSERT INTO Sessions VALUES ('" + [user, token].join("','") + "')");
	});
	res.end(JSON.stringify({"user":user,"token":token}));
});

addAction("loginUser", "POST", function(req, res, get, post) {
 	var data = parseJSON(post);
 	var pass = data.pass;
 	var user = data.user;
 	db.serialize(function() {
 		db.run("CREATE TABLE IF NOT EXISTS Sessions (user TEXT, token TEXT)");
 		db.all("SELECT * FROM Users WHERE user = '" + user + "' AND pass = '" + pass + "'", function(err, results) {
 			if (typeof(results) != "undefined" && results.length > 0){
 				var token = randomStr();
 				db.run("INSERT INTO Sessions VALUES ('" + [user, token].join("','") + "')");
				res.end(JSON.stringify({"user" : user, "token" : token}));
 			}
 			else {
 				res.end("invalid login");
 			}
 		});
 	});
});

addAction("addEvent", "POST", function(req, res, get, post) {
	var user = get.user;
	var data = parseJSON(post);
	validateSession(user, get.token, function(valid) {
		if(valid) {
			db.serialize(function() {
				db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month INTEGER, day INTEGER, year INTEGER, time TEXT, event TEXT)");
				var insert = getInsertSql(user + "_Calendar", [data.month, data.day, data.year, data.time, data.event]);
				db.run(insert);
			});
			res.end("success");
		}
		else {
			res.end("invalid session");
		}
	});
});

addAction("getEvents", "GET", function(req, res, get) {
	var user = get.user;
	validateSession(user, get.token, function(valid) {
		if(valid) {
			db.serialize(function() {
				db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month INTEGER, day INTEGER, year INTEGER, time TEXT, event TEXT)");
				db.all("SELECT * FROM " + user + "_Calendar", function(err, events) {
					res.end(JSON.stringify(events));
				});
			});
		}
		else {
			res.end("invalid session");
		}
	});
});

addAction("searchUsers", "GET", function(req, res, get) {
	var searchItem = get.item;
	var results = [];
	db.serialize(function() {
 		db.each("SELECT first, last FROM Users", function(err, user) {
  			var name = user.first + " " + user.last;
  			if(~name.toLowerCase().indexOf(searchItem.toLowerCase())) {
  	 			results.push(name);
  			}
 		}, function() {
  				res.end(JSON.stringify(results));
		});
	});
});

function validateSession(user, token, cb){
	db.all("SELECT * FROM Sessions WHERE user = '" + user + "' AND token = '" + token + "'", function(err, results) {
		cb(typeof(results) != "undefined" && results.length > 0);
	});
}

function randomStr() {
	var str = "";
	for(var i = 0; i < 32; i++) {
		var rand = Math.floor(Math.random() * 62);
		str += String.fromCharCode(rand + ((rand < 26) ? 97 : ((rand < 52) ? 39 : -4)));
	}
	return str;
}

function getInsertSql(table, arr) {
	if(!isValidInput(table)) {
		return null;
	}
	var strs = []
	for(var i = 0; i < arr.length; i++) {
		if(typeof(arr[i]) == "string") {
			strs.push("\"" + arr[i] + "\"");
		}
		else {
			strs.push(String(arr[i]));
		}
		if(!isValid(arr[i])) {
			return null;
		}
	}
	return "INSERT INTO " + table + " VALUES (" + strs.join(",") + ")";
}

function isValidInput(str) {
	for(var i = 0; i < str.length; i++) {
		var char = str.charAt(i);
		switch(true) {
			 case "0" <= char && char <= "9":
			 case "a" <= char && char <= "z":
			 case "A" <= char && char <= "Z":
			 case char == "_":
			 	break;
			 default:
			 	return false;
		}
	}
	return true;
}

/*
io.listen(server).on("connection", function(socket) {

	socket.on("disconnect", function() {
		
	});

});
*/