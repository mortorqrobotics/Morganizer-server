var http = require("http");
var fs = require("fs");
var url = require("url");
var qs = require("querystring");
var io = require("socket.io");
var sqlite = require("sqlite3");
var db = new sqlite.Database("data.db");

function parseJSON(str) {
	try {
		return JSON.parse(String(str));
	}
	catch(ex) {}
}

var server = http.createServer(function(req, res) {
	var path = url.parse(req.url).pathname;
	var get = qs.parse(url.parse(req.url).query);
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
						action.cb(req, res, get, data);
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

addAction("loadmessages", "POST", function(req, res, get, post) {
	//Add user verification
	var data = parseJSON(post);
	var user1 = data.user1.username;
	var user2 = data.user2.username;
	var name1 = data.user1.name;
	var name2 = data.user2.name;
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS ChatList (code TEXT, user1 TEXT, user2 TEXT)");
		db.all("SELECT * FROM ChatList WHERE (user1 = '" + user1 + "' OR user2 = '" + user1 + "') AND (user1 = '" + user2 + "' OR user2 = '" + user2 + "')", function(err, results){
			if (typeof(results) != "undefined"&&results.length == 1){
				var code = results[0].code;
				db.run("CREATE TABLE IF NOT EXISTS " + code + "_Messages (sender TEXT, message TEXT, user TEXT)");
				db.all("SELECT * FROM " + code + "_Messages", function(err, messages){
					res.end(JSON.stringify({"chatcode":code, "messages":messages}));
				});
			}
			else {
				var newChatCode = "A" + randomStr();
				db.run("INSERT INTO ChatList VALUES ('" + [newChatCode, user1, user2].join("','") + "')");
				db.run("CREATE TABLE IF NOT EXISTS " + newChatCode + "_Messages (sender TEXT, message TEXT, user TEXT)");
				res.end(JSON.stringify({"chatcode":newChatCode, "messages":[]}));
			}
		});
	});
});

addAction("getPic", "GET", function(req, res, get){
	//Add user verification
	var user = get.user;
	db.run("CREATE TABLE IF NOT EXISTS UserProfilePics (user TEXT, pic BLOB)");
	db.all("SELECT * FROM UserProfilePics WHERE user = '" + user + "'", function(err, result) {
		if (typeof(result) != "undefined"&&result.length == 1){
			res.end(result[0].pic);
		}
		else {
			res.end("fail");
		}
	});
});

addAction("uploadProfPic", "POST", function(req, res, get, post){
	//Add user verification
	var user = get.user;
	var pic = post;
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS UserProfilePics (user TEXT, pic BLOB)");
		var prep = db.prepare("INSERT INTO UserProfilePics VALUES ('"+ user + "', ?)");
		prep.run(pic);
		prep.finalize();
		res.end("success");
	});
});

addAction("addmessage", "POST", function(req, res, get, post) {
	//Add user verification
	var data = parseJSON(post);
	var user = data.username;
	var name = data.name;
	var message = data.message;
	var chatcode = data.chatcode;
	db.serialize(function() {
		db.all("SELECT code FROM ChatList WHERE code = '" + chatcode + "'", function(err, results){
			if (typeof(results) != "undefined"&&results.length == 1){
				db.run("CREATE TABLE IF NOT EXISTS " + chatcode + "_Messages (sender TEXT, message TEXT, user TEXT)");
				db.run("INSERT INTO " + chatcode + "_Messages VALUES ('" + [name, message, user].join("','") + "')");
				res.end("success");
			}
			else {
				res.end("fail");
			}
		});
	});
});

addAction("loadgroupmessages", "POST", function(req, res, get, post){
	var data = parseJSON(post);
	var user = data.user; //Verify user
	var chatID = data.chatID;
	db.serialize(function(){
		db.all("SELECT * FROM " + chatID + "_Messages", function(err, results){
			if (typeof(results) != "undefined"&&results.length > 0){
				res.end(results);
			}
			else {
				res.end([]);
			}
		});
	});
});

addAction("creategroupchat", "POST", function(req, res, get, post){
	var data = parseJSON(post);
	var creator = data.creator;//Verify user
	var users = data.users;
	var chatName = data.chatName;
	var teamCode = data.teamCode; //Use MAYbe
	var chatID = randomStr();
	db.serialize(function(){
		db.run("CREATE TABLE IF NOT EXISTS ChatGroups (groupName TEXT, groupID TEXT, user TEXT)");
		db.run("CREATE TABLE IF NOT EXISTS " + chatID + "_Messages (sender TEXT, message TEXT, user TEXT)")
		for (var i = 0; i < users.length; i++){
			var user = users[i];
			db.run("INSERT INTO ChatGroups VALUES ('" + [chatName, chatID, user].join("','") + "')")
		}
		res.end({"chatName":chatName, "chatID":chatID});
	});
});

addAction("getgroupchats", "POST", function(req, res, get, post){
	var data = parseJSON(post);
	var user = data.user; //Verify user
	var teamCode = data.teamCode;//use later
	db.serialize(function(){
		db.all("SELECT groupName, groupID FROM ChatGroups WHERE user = '" + user + "'", function(err, results){
			if (typeof(results) != "undefined"&&results.length > 0){
				res.end(results);
			}
			else {
				res.end([]);
			}
		});
	});
});

addAction("getteammates", "POST", function(req, res, get, post) {
	var data = parseJSON(post);
	var user = data.user;//verify user
	var teamCode = "";
	db.serialize(function() {
		db.all("SELECT teamCode FROM Users WHERE user = '" + user + "'", function(err, result){
			if (typeof(result) != "undefined"&&result.length > 0){
				teamCode = result[0].teamCode;
				db.all("SELECT first, last, user FROM Users WHERE teamCode = '" + teamCode + "' AND user <> '" + user + "'", function(err, results){
					if (typeof(results) != "undefined"&&results.length > 0){
						res.end(JSON.stringify(results));
					}
					else {
						res.end("fail");
					}
				});
			}
			else {
				res.end("fail");
			}
		});
	});
});

addAction("deletePost", "POST", function(req, res, get, post){
	var data = parseJSON(post);
	var postNum = data.postNum;
	var user = data.user;
	var teamCode = "";
	db.serialize(function(){
		db.all("SELECT teamCode from Users WHERE user = '" + user + "'", function(err, results){
			if(typeof(results) != undefined && results.length > 0){
				teamCode = results[0].teamCode;
				db.run("DELETE FROM Announcements WHERE postNum = '" + postNum + "' AND teamCode='" + teamCode + "'");
				res.end("success");
			}else{
				res.end("fail");
			}
		});
	});
});
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
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT, first TEXT, last TEXT, teamName TEXT, teamNumber TEXT, teamCode TEXT, subdivision TEXT, phone TEXT)");
		db.run("CREATE TABLE IF NOT EXISTS Teams (number TEXT, name TEXT, code TEXT)");//number is text for a reason, don't change
		db.all("SELECT * FROM Teams WHERE code = '" + teamCode + "'", function(err, results) {
			if (typeof(results) != "undefined"&&results.length == 1){
				var number = results[0].number;
				var name = results[0].name;
				db.run("INSERT INTO Users VALUES ('" + [user, pass, email, firstName, lastName, name, number, teamCode, subdivision, phone].join("','") + "')");
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
 	db.serialize(function() {
 		db.run("CREATE TABLE IF NOT EXISTS Sessions (user TEXT, token TEXT)");
		db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT, first TEXT, last TEXT, teamName TEXT, teamNumber TEXT, teamCode TEXT, subdivision TEXT, phone TEXT)");
 		db.all("SELECT * FROM Users WHERE (user = '" + user + "' OR email = '" + user + "') AND pass = '" + pass + "'", function(err, results) {
 			if (typeof(results) != "undefined" && results.length > 0){
 				var token = randomStr();
 				var email = results[0].email;
 				var username = results[0].user;
 				var subdivision = results[0].subdivision;
 				var phone = results[0].phone;
 				var firstName = results[0].first;
 				var lastName = results[0].last;
 				var name = results[0].teamName;
 				var number = results[0].teamNumber;
 				db.run("INSERT INTO Sessions VALUES ('" + [user, token].join("','") + "')");
				res.end(JSON.stringify({"user":user,"token":token,"email":email,"teamName":name, "teamNumber":number, "subdivision":subdivision,"phone":phone,"first":firstName,"last":lastName}));
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

addAction("announce", "POST", function(req, res, get, post) {
	console.log("post");
	var data = parseJSON(post);
	var user = data.user;
	var nameDate = data.nameDate;
	var text = data.text;
	var postNum = 1;
	var teamCode = "";
	db.serialize(function() {
		db.all("SELECT teamCode FROM Users WHERE user = '" + user + "'", function(err, results){
			if (typeof(results) != "undefined"&&results.length > 0){
				teamCode = results[0].teamCode;
				db.all("SELECT * FROM Announcements WHERE teamCode='" + teamCode + "'", function(err, results){
					if(results.length == 0){
						postNum = 1
					}else{
						postNum = results[results.length-1].postNum + 1;
					}
					db.run("CREATE TABLE IF NOT EXISTS Announcements (nameDate TEXT, text TEXT, teamCode TEXT, postNum INTEGER)");
					db.run("INSERT INTO Announcements VALUES ('" +[nameDate, text, teamCode, postNum].join("','")+ "')");
					res.end("success");
				});

			}
			else {
				res.end("fail");
			}
		});
	});
});

addAction("getannouncements", "POST", function(req, res, get, post) {
	var data = parseJSON(post);
	var user = data.user;
	var teamCode = "";
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS Announcements (nameDate TEXT, text TEXT, teamCode TEXT, postNum INTEGER)");
		db.all("SELECT teamCode FROM Users WHERE user = '" + user + "'", function(err, results){
			if (typeof(results) != "undefined"&&results.length > 0){
				teamCode = results[0].teamCode;
				db.all("SELECT * FROM Announcements WHERE teamCode = '" + teamCode + "'", function(err, results){
					res.end(JSON.stringify(results));
				});
			}
			else {
				res.end("fail");
			}
		});
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

var clients = []
io.listen(server).on("connection", function(socket) {
	socket.on("disconnect", function() {
		for(var i = 0; i < clients.length; i++) {
   			if(clients[i].socket == socket) {
    			clients.splice(i, 1);
    			break;
   			}
  		}
	});
	socket.on("newmessage", function(data){
		if (typeof(data) != "undefined"&&data != ""){
			//Sender(client) must send array of usernames that it is sending to
			for(var i = 0; i < clients.length; i++) {
   				if(clients[i].chatcode == data.chatcode) {
    				clients[i].socket.emit("message", data);
   				}
				else {//Uncomment when client is done w/ notifications
					/*for (var j = 0; j < data.recievers.length; j++){
						if (clients[i].user == data.recievers[j]){
							clients[i].socket.emit("notification", data);
						}
					}*/
				}
  			}
		}
	});
	socket.on("updateclient", function(data){
		if (typeof(data) != "undefined"&&data != ""){
			var isConnected = false;
			for (var i = 0;i < clients.length;i++){
				if (socket == clients[i].socket){
					isConnected = true;
					clients[i].chatcode = data.chatcode;
					clients[i].user = data.user;
					//clients[i].page = data.page; Use later
					break;
				}
			}
			if (!isConnected){
				clients.push({"socket":socket, "chatcode":data.chatcode,"page":"use later", "user":data.user});
			}
			socket.emit("updated", {});
		}
	});
});
