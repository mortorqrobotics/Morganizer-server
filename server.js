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

var port = process.argv[2] || 80;
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
	var teamCode = data.teamCode;
	var token = randomStr();
	console.log("Ran2");
	console.log(user);
	console.log(pass);
	console.log("hi");
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT, first TEXT, last TEXT, teamName TEXT, teamNumber TEXT, subdivision TEXT, phone TEXT)");
		db.run("CREATE TABLE IF NOT EXISTS Teams (number TEXT, name TEXT, code TEXT)");//number is text for a reason, don't change
		db.all("SELECT * FROM Teams WHERE code = '" + teamCode + "'", function(err, results) {
			if (typeof(results) != "undefined"&&results.length == 1){
				var number = results[0].number;
				var name = results[0].name;
				db.run("INSERT INTO Users VALUES ('" + [user, pass, email, firstName, lastName, name, number, subdivision, phone].join("','") + "')");
				res.end(JSON.stringify({"user":user,"token":token,"email":email,"teamName":name, "teamNumber":number, "subdivision":subdivision,"phone":phone,"first":firstName,"last":lastName}));
			}
			else {
				res.end("no team");
				console.log("no team");
			}
		});
	});
	
});
addAction("createTeam", "POST", function(req, res, get, post) {

	var data = parseJSON(post);	
	var user = data.user;
	var teamName = data.teamName;
	var teamNumber = data.teamNumber;
	var chosenCode = data.chosenCode;
	
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS Teams (number TEXT, name TEXT, code TEXT)");//number is text for a reason, don't change
		db.all("SELECT code FROM Teams WHERE code = '" + chosenCode + "'", function(err, results) {
			if (typeof(results) != "undefined"&&results.length > 0){
				res.end("team exists");
			}
			else {
				db.run("INSERT INTO Teams VALUES ('" +[teamNumber, teamName, chosenCode].join("','")+ "')");
				res.end("added team"); 
			}
		});
	});
			
});
addAction("loginUser", "POST", function(req, res, get, post) {
 	var data = parseJSON(post);
 	var pass = data.pass;
 	var user = data.user;
 	console.log(user);
 	console.log(pass);
 	console.log("Ran3");
 	db.serialize(function() {
 		db.run("CREATE TABLE IF NOT EXISTS Sessions (user TEXT, token TEXT)");
 		db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT, first TEXT, last TEXT, teamName TEXT, teamNumber TEXT, subdivision TEXT, phone TEXT)");
 		db.all("SELECT * FROM Users WHERE (user = '" + user + "' OR email = '" + user + "') AND pass = '" + pass + "'", function(err, results) {
 			if (typeof(results) != "undefined" && results.length > 0){
 				var token = randomStr();
 				var email = results[0].email;
 				var username = results[0].user;
 				var subdivision = results[0].subdivision;
 				var phone = results[0].phone;
 				var firstName = results[0].first;
 				var lastName = results[0].last;
 				db.run("INSERT INTO Sessions VALUES ('" + [user, token].join("','") + "')");
				res.end(JSON.stringify({"user":username,"token":token,"email":email,"subdivision":subdivision,"phone":phone,"first":firstName,"last":lastName}));
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
//Consider post data for token and search item (spaces)
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

addAction("searchEvents", "GET", function(req, res, get) {
	var searchItem = get.item;
	var user = get.user;
	var results = [];
	validateSession(user, get.token, function(valid) {
		if(valid) {
			db.serialize(function() {
				db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month INTEGER, day INTEGER, year INTEGER, time TEXT, event TEXT)");
 				db.all("SELECT * FROM "+ user + "_Calendar WHERE event LIKE '%" + searchItem + "%'", function(err, events) {
  					if (typeof(events) != "undefined"&&events.length > 0){
  						results = events;
  					}
  					res.end(JSON.stringify(results));
				});
			});
		}
		else {
			res.end("invalid session");
		}
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