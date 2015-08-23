var http = require("http");
var fs = require("fs");
var url = require("url");
var qs = require("querystring");
var io = require("socket.io");
var sqlite = require("sqlite3");
var db = new sqlite.Database("data.db");
var clients = [];
//http.globalAgent.maxSockets = Inf;
function parseJSON(str) {
    try {
        return JSON.parse(String(str));
    } catch (ex) {}
}

function bytesToSize(bytes) {
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes == 0) return '0 Byte';
    var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
};

var server = http.createServer(function(req, res) {
    var path = url.parse(req.url).pathname;
    var get = qs.parse(url.parse(req.url).query);
    var any = false;
    for (var i = 0; i < actions.length; i++) {
        if (path.toLowerCase() == ("/f/" + actions[i].path).toLowerCase()) {
            if (actions[i].method.toLowerCase() == "post") {
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
            } else if (actions[i].method.toLowerCase() == "get") {
                actions[i].cb(req, res, get);
            }
            any = true;
            break;
        }
    }
    var found = true;
    var hidden = [".git", ".DS_Store", "LICENSE", "README.md"];
    for (var i = 0; i < hidden.length; i++) {
        if (~path.toLowerCase().indexOf(hidden[i].toLowerCase())) {
            found = false;
            break;
        }
    }
    if (!any && found) {
        path = path.replace(/\.+/, ".");
        if (path == "/") {
            path = "/index.html";
        } else if (!~path.indexOf(".")) {
            path += ".html";
        }
        fs.readFile("../Morganizer-website" + path, function(err, data) {
            if (err) {
                found = false;
            } else {
                res.end(data);
            }
        });
    }
    if (!found) {
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
        db.all("SELECT * FROM ChatList WHERE (user1 = '" + user1 + "' OR user2 = '" + user1 + "') AND (user1 = '" + user2 + "' OR user2 = '" + user2 + "')", function(err, results) {
            if (typeof(results) != "undefined" && results.length == 1) {
                var code = results[0].code;
                db.run("CREATE TABLE IF NOT EXISTS " + code + "_Messages (sender TEXT, message TEXT, user TEXT)");
                db.all("SELECT * FROM " + code + "_Messages", function(err, messages) {
                    res.end(JSON.stringify({
                        "chatcode": code,
                        "messages": messages
                    }));
                });
            } else {
                var newChatCode = "A" + randomStr();
                db.run("INSERT INTO ChatList VALUES ('" + [newChatCode, user1, user2].join("','") + "')");
                db.run("CREATE TABLE IF NOT EXISTS " + newChatCode + "_Messages (sender TEXT, message TEXT, user TEXT)");
                res.end(JSON.stringify({
                    "chatcode": newChatCode,
                    "messages": []
                }));
            }
        });
    });
});

addAction("addteam", "POST", function(req, res, get, post){
    //Add user verification
    //TODO:Prevent SQL injection EVERYWHERE
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    var first = data.first;
    var last = data.last;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS TeamsForUsers (user TEXT, teamCode TEXT, teamName TEXT, position TEXT, first TEXT, last TEXT, teamNumber TEXT)");
        db.all("SELECT * FROM Teams WHERE code = '" + teamCode + "'", function(err, results){
            if (typeof(results) != "undefined"&&results.length == 1){
                var teamNumber = results[0].number;
                var teamName = results[0].name;
                db.run("INSERT INTO TeamsForUsers VALUES ('"+[user, teamCode, teamName, "Position", first, last, teamNumber].join("','")+"')");
                res.end(JSON.stringify(results));
            }
            else {
                res.end("fail");
            }
        })
    });

});

addAction("getteams", "POST", function(req, res, get, post){
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS TeamsForUsers (user TEXT, teamCode TEXT, teamName TEXT, position TEXT, first TEXT, last TEXT, teamNumber TEXT)");
        db.all("SELECT * FROM TeamsForUsers WHERE user = '"+user+"'", function(err, results){
            if (typeof(results) != "undefined"){
                res.end(JSON.stringify(results));
            }
        });
    });
});

addAction("getPic", "GET", function(req, res, get) {
    //Add user verification
    var user = get.user;
    db.run("CREATE TABLE IF NOT EXISTS UserProfilePics (user TEXT, pic BLOB)");
    db.all("SELECT * FROM UserProfilePics WHERE user = '" + user + "'", function(err, result) {
        if (typeof(result) != "undefined" && result.length == 1) {
            res.end(result[0].pic);
        } else {
            res.end("fail");
        }
    });
});

addAction("uploadProfPic", "POST", function(req, res, get, post) {
    //Add user verification
    var user = get.user;
    var pic = post;
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS UserProfilePics (user TEXT, pic BLOB)");
        var prep = db.prepare("INSERT INTO UserProfilePics VALUES ('" + user + "', ?)");
        prep.run(pic);
        prep.finalize();
        res.end("success");
    });
});

addAction("newfolder", "POST", function(req, res, get, post) {
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var people = data.people;
    var folderCode = "F" + randomStr();
    var folderName = data.folderName;
    people.push(user);
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS DriveFolders (user TEXT, folderName TEXT, folderCode TEXT)");
        for (var i = 0; i < people.length; i++){
            var person = people[i];
            db.run("INSERT INTO DriveFolders VALUES ('"+[person, folderName, folderCode].join("','")+"')")
        }
        res.end(folderCode);
    });
});

addAction("getfolders", "POST", function(req, res, get, post) {
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS DriveFolders (user TEXT, folderName TEXT, folderCode TEXT)");
        db.all("SELECT folderName, folderCode FROM DriveFolders WHERE user = '"+user+"'", function(err, results){
            res.end(JSON.stringify(results));
        });
    });
});

addAction("showallfiles", "POST", function(req, res, get, post){
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    var allFiles = [];
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS DriveFolders (user TEXT, folderName TEXT, folderCode TEXT)");
        db.all("SELECT folderCode FROM DriveFolders WHERE user = '"+user+"'", function(err, results){
            var folders = results;
            folders.push({"folderCode":user});
            folders.push({"folderCode":teamCode});
            var done = 0;
            for (var i = 0; i < folders.length; i++) {
                db.all("SELECT fileName, fileCode, fileSize, fileType, user FROM DriveFiles WHERE folder = '" + folders[i].folderCode + "' ", function(err, files){
                    allFiles = allFiles.concat(files);
                    done++;
                    if (done == folders.length){
                        res.end(JSON.stringify(allFiles));
                    }
                });
            }
        });
    });
});

addAction("uploadtodrive", "POST", function(req, res, get, post) {
    //Add user verification
    var file = post;
    var fileSize = bytesToSize(post.length);
    var user = unescape(get.user);
    var teamCode = unescape(get.teamcode);
    var rawName = unescape(get.rawname);
    var folder = unescape(get.folder);
    var fileName = unescape(get.filename);
    var type = rawName.split(".").pop().toLowerCase();
    var fileCode = "F" + randomStr();
    db.serialize(function() {
        if (post.length < 50000000){
            db.run("CREATE TABLE IF NOT EXISTS DriveFiles (teamCode TEXT, folder TEXT, fileName TEXT, fileCode TEXT, fileSize TEXT, fileType TEXT, rawName TEXT, user TEXT, file BLOB)");
            var prep = db.prepare("INSERT INTO DriveFiles VALUES ('" + [teamCode, folder, fileName, fileCode, fileSize, type, rawName, user].join("','") + "', ?)");
            prep.run(file);
            prep.finalize();
            res.end(JSON.stringify({"fileCode":fileCode, "fileType":type, "fileSize":fileSize}));
        }
        else {
            res.end("Too large")
        }
    });
});

addAction("getfile", "GET", function(req, res, get) {
    //Add user verifcation
    var user = get.user;
    var fileCode = get.filecode;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS DriveFiles (teamCode TEXT, folder TEXT, fileName TEXT, fileCode TEXT, fileSize TEXT, fileType TEXT, rawName TEXT, user TEXT, file BLOB)");
        db.all("SELECT file, rawName, fileType FROM DriveFiles WHERE fileCode='"+ fileCode + "'", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0) {
                res.setHeader("Content-disposition", "attachment; filename=" + results[0].rawName);
                res.end(results[0].file);
            }
            else {
                res.end("File does not exist")
            }
        });
    });
});

addAction("deletefile", "POST", function(req, res, get, post) {
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var fileCode = data.fileCode;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS DriveFiles (teamCode TEXT, folder TEXT, fileName TEXT, fileCode TEXT, fileSize TEXT, fileType TEXT, rawName TEXT, user TEXT, file BLOB)");
        db.run("DELETE FROM DriveFiles WHERE fileCode = '"+fileCode+"'");
        res.end("success");
    })
});


addAction("showfiles", "POST", function(req, res, get, post){
    //Add user verifcation
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    var folder = data.folder;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS DriveFiles (teamCode TEXT, folder TEXT, fileName TEXT, fileCode TEXT, fileSize TEXT, fileType TEXT, rawName TEXT, user TEXT, file BLOB)");
        db.all("SELECT fileName, fileCode, fileSize, fileType, user FROM DriveFiles WHERE teamCode = '" + teamCode + "' AND folder = '" + folder + "' ", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0){
                res.end(JSON.stringify(results));
            }
            else {
                res.end(JSON.stringify([]));
            }
        })
    });
});

addAction("updateattendance", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var updatedList = data.updatedList;
    var eventID = data.eventID;
    db.serialize(function(){
        for (var i = 0; i < updatedList.length; i++){
            db.run("UPDATE AllEvents SET isPresent = '"+updatedList[i].isPresent+"' WHERE user = '"+updatedList[i].user+"' AND eventID = '"+eventID+"'");
        }
        res.end("success");
    });
});

addAction("getattendance", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var eventID = data.eventID;
    db.serialize(function(){
        db.all("SELECT user, isPresent FROM AllEvents WHERE eventID = '"+eventID+"'", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0){
                res.end(JSON.stringify(results));
            }
            else {
                res.end(JSON.stringify([]));
            }
        })
    });
});

addAction("getuserinfo", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var desiredUser = data.desiredUser;
    db.serialize(function(){
        db.all("SELECT user, first, last, phone, email FROM Users WHERE user = '"+desiredUser+"'", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0){
                res.end(JSON.stringify(results));
            }
            else {
                res.end(JSON.stringify([]));
            }
        });
    });
});

addAction("addevent", "POST", function(req, res, get, post){
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var eventName = data.eventName;
    var eventDesc = data.eventDesc;
    var timeStamp = data.timeStamp;
    var people = data.people;
    people.push(user);
    var day = data.day;
    var month = data.month;
    var year = data.year;
    var eventID = "E"+randomStr();
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS AllEvents (user TEXT, eventName TEXT, eventDesc TEXT, timeStamp TEXT, day TEXT, month TEXT, year TEXT, eventID TEXT, isPresent TEXT)");
        for (var i = 0; i < people.length; i++){
            db.run("INSERT INTO AllEvents VALUES ('"+[people[i], eventName, eventDesc, timeStamp, day, month, year, eventID, "false"].join("','")+"')")
        }
        res.end(eventID);
    });
});

addAction("makescope", "POST", function(req, res, get, post){
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var scopeName = data.scopeName;
    var teamCode = data.teamCode;
    var status = data.status;
    var members = data.members;
    db.serialize(function(){
        //Make so you can't have same name
        db.run("CREATE TABLE IF NOT EXISTS ScopesForTeam (teamCode TEXT, scopeName TEXT, status TEXT, admin TEXT)");
        db.run("CREATE TABLE IF NOT EXISTS UsersInScope (teamCode TEXT, scopeName TEXT, user TEXT)")
        db.run("INSERT INTO ScopesForTeam VALUES ('"+[teamCode, scopeName, status, user].join("','")+"')");
        db.run("INSERT INTO UsersInScope VALUES ('"+[teamCode, scopeName, user].join("','")+"')");
        //for (var i = 0; i < members.length; i++){
            //db.run("INSERT INTO UsersInScope VALUES ('"+[teamCode, scopeName, members[i]].join("','")+"')");
        //}
        db.run("CREATE TABLE IF NOT EXISTS PendingScopeInvites (inviter TEXT, teamCode TEXT, scopeName TEXT, newUser TEXT)");
        for (var i = 0; i < members.length; i++){
            db.run("INSERT INTO PendingScopeInvites VALUES ('"+[user, teamCode, scopeName, members[i]].join("','")+"')");
        }
        res.end("success")
    })
});

addAction("getyourscopes", "POST", function(req, res, get, post){
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    db.serialize(function(){
        db.all("SELECT scopeName FROM UsersInScope WHERE user = '"+user+"' AND teamCode = '"+teamCode+"'", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0){
                res.end(JSON.stringify(results));
            }
            else{
                //Error or has no scope in this team
                res.end(JSON.stringify([]));
            }
        });
    });
});
addAction("getusersinscope", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    var scopeName = data.scopeName;
    db.serialize(function(){
        db.all("SELECT user FROM UsersInScope WHERE scopeName = '"+scopeName+"' AND teamCode = '"+teamCode+"'", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0){
                res.end(JSON.stringify(results));
            }
            else{
                //Error or scope does not exist or no users in scope
                res.end(JSON.stringify([]));
            }
        });
    });
});
addAction("getpublicscopesforteam", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    db.serialize(function(){
        db.all("SELECT scopeName FROM ScopesForTeam WHERE teamCode = '"+teamCode+"' AND status = 'public'", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0){
                res.end(JSON.stringify(results));
            }
            else{
                //Error or no public scopes
                res.end(JSON.stringify([]));
            }
        });
    });
});

addAction("inviteuserstoscope", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var members = data.members;
    var teamCode = data.teamCode;
    var scopeName = data.scopeName;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS PendingScopeInvites (inviter TEXT, teamCode TEXT, scopeName TEXT, newUser TEXT)");
        for (var i = 0; i < members; i++){
            db.run("INSERT INTO PendingScopeInvites VALUES ('"+[user, teamCode, scopeName, members[i]].join("','")+"')")
        }
        res.end("success");
    });
});

addAction("respondtoinvite", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var scopeName = data.scopeName;
    var teamCode = data.teamCode;
    var response = data.response;
    db.serialize(function(){
        db.run("DELETE FROM PendingScopeInvites WHERE newUser = '"+user+"' AND scopeName = '"+scopeName+"' AND teamCode = '"+teamCode+"'");
        if (response == "accept"){
            db.run("INSERT INTO UsersInScope VALUES ('"+[teamCode, scopeName, user].join("','")+"')");
        }
        res.end("success")
    });
});

addAction("getscopeinvites", "POST", function(req, res, get, post){
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    db.serialize(function(){
        db.all("SELECT scopeName FROM PendingScopeInvites WHERE newUser = '"+user+"' AND teamCode = '"+teamCode+"'", function(err, results){
            if (typeof(results) != "undefined"&&results.length > 0){
                res.end(JSON.stringify(results));
            }
            else{
                //Error or no pending invites
                res.end(JSON.stringify([]));
            }
        });
    });
});

addAction("getevents", "POST", function(req, res, get, post){
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var month = data.month;
    var year = data.year;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS AllEvents (user TEXT, eventName TEXT, eventDesc TEXT, timeStamp TEXT, day TEXT, month TEXT, year TEXT, eventID TEXT, isPresent TEXT)");
        db.all("SELECT * FROM AllEvents WHERE user = '" + user + "' AND year = '"+year+"' AND month = '"+month+"'", function(err, results){
            if (typeof(results) != "undefined" && results.length > 0){
                res.end(JSON.stringify(results));
            }
            else {
                res.end(JSON.stringify([]));
            }
        });
    });
});

addAction("getupcomingevents", "POST", function(req, res, get, post){
    //Add user verification
    var data = parseJSON(post);
    var user = data.user;
    var currentTime = data.currentTime;
    db.serialize(function(){
        db.run("CREATE TABLE IF NOT EXISTS AllEvents (user TEXT, eventName TEXT, eventDesc TEXT, timeStamp TEXT, day TEXT, month TEXT, year TEXT, eventID TEXT, isPresent TEXT)");
        db.all("SELECT * FROM AllEvents WHERE user = '"+user+"' AND timeStamp > '"+currentTime+"' ORDER BY timeStamp ASC", function(err, results){
            if (typeof(results) != "undefined" && results.length > 0){
                res.end(JSON.stringify(results));
                //Make only first 10-20ish?
            }
            else {
                res.end(JSON.stringify([]));
            }
        });
    })
});

addAction("addmessage", "POST", function(req, res, get, post) {
    //Add user verification
    var data = parseJSON(post);
    var user = data.username;
    var name = data.name;
    var message = data.message;
    var chatcode = data.chatcode;
    db.serialize(function() {
        db.all("SELECT code FROM ChatList WHERE code = '" + chatcode + "'", function(err, results) {
            if (typeof(results) != "undefined" && results.length == 1) {
                db.run("CREATE TABLE IF NOT EXISTS " + chatcode + "_Messages (sender TEXT, message TEXT, user TEXT)");
                db.run("INSERT INTO " + chatcode + "_Messages VALUES ('" + [name, message, user].join("','") + "')");
                res.end("success");
            } else {
                db.all("SELECT groupID FROM ChatGroups WHERE groupID = '" + chatcode + "'", function(err, results) {
                    if (typeof(results) != "undefined" && results.length > 0) {
                        db.run("INSERT INTO " + chatcode + "_Messages VALUES ('" + [name, message, user].join("','") + "')");
                        res.end("success");
                    } else {
                        res.end("fail");
                    }
                });
            }
        });
    });
});

addAction("loadgroupmessages", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var user = data.user; //Verify user
    var chatID = data.chatID;
    db.serialize(function() {
        db.all("SELECT * FROM " + chatID + "_Messages", function(err, results) {
            if (typeof(results) != "undefined") {
                db.all("SELECT user FROM ChatGroups WHERE groupID='" + chatID + "'", function(err, users) {
                    if (typeof(users) != "undefined" && users.length > 0) {
                        res.end(JSON.stringify({
                            "messages": results,
                            "users": users
                        }));
                    }
                });
            } else {
                db.all("SELECT user FROM ChatGroups WHERE groupID='" + chatID + "'", function(err, users) {
                    if (typeof(users) != "undefined" && users.length > 0) {
                        res.end(JSON.stringify({
                            "messages": [],
                            "users": users
                        }));
                    } else {
                        //res.end("fail");
                        res.end(JSON.stringify({
                            "messages": [],
                            "users": users
                        }));
                    }
                });
            }
        });
    });
});

addAction("creategroupchat", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var creator = data.creator; //Verify user
    var users = data.users; //check if more than one
    users.push(creator);
    var chatName = data.chatName; //check if .trim() == ""
    //var teamCode = data.teamCode; //Use MAYbe
    var chatID = "B" + randomStr();
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS ChatGroups (groupName TEXT, groupID TEXT, user TEXT)");
        db.run("CREATE TABLE IF NOT EXISTS " + chatID + "_Messages (sender TEXT, message TEXT, user TEXT)")
        for (var i = 0; i < users.length; i++) {
            var user = users[i];
            db.run("INSERT INTO ChatGroups VALUES ('" + [chatName, chatID, user].join("','") + "')")
        }
        res.end(JSON.stringify({
            "chatName": chatName,
            "chatID": chatID
        }));
    });
});

addAction("getgroupchats", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var user = data.user; //Verify user
    var teamCode = data.teamCode; //use later
    db.serialize(function() {
        db.all("SELECT groupName, groupID FROM ChatGroups WHERE user = '" + user + "'", function(err, results) {
            //console.log(user);
            if (typeof(results) != "undefined" && results.length > 0) {
                res.end(JSON.stringify(results));
            } else {
                res.end(JSON.stringify([]));
            }
        });
    });
});

addAction("getteammates", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var user = data.user; //verify user
    var teamCode = data.teamCode;
    db.serialize(function() {
        db.all("SELECT first, last, user FROM TeamsForUsers WHERE teamCode = '" + teamCode + "' AND user <> '" + user + "'", function(err, results) {
            if (typeof(results) != "undefined" && results.length > 0) {
                var teammates = results;
                for (var i = 0; i < teammates.length; i++) {
                    teammates[i]["status"] = "offline";
                    for (var j = 0; j < clients.length; j++) {
                        if (clients[j].teamcode == teamCode && teammates[i].user == clients[j].user) {
                            teammates[i].status = "online";
                            break;
                        }
                    }
                }
                res.end(JSON.stringify(teammates));
            } else {
                res.end(JSON.stringify([]));
            }
        });
    });
});

addAction("deletePost", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var postNum = data.postNum;
    var user = data.user;
    var teamCode = data.teamCode;
    db.serialize(function() {
        db.run("DELETE FROM Announcements WHERE postNum = '" + postNum + "' AND teamCode='" + teamCode + "'");
        res.end("success");
    });
});
addAction("createUser", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var user = data.user;
    var pass = data.pass;
    var email = data.email;
    var phone = data.phone;
    var firstName = data.firstName;
    var lastName = data.lastName;
    var token = randomStr();
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT, first TEXT, last TEXT, phone TEXT)");
        db.run("INSERT INTO Users VALUES ('" + [user, pass, email, firstName, lastName, phone].join("','") + "')");
        res.end(JSON.stringify({
            "user": user,
            "token": token,
            "email": email,
            "phone": phone,
            "first": firstName,
            "last": lastName
        }));
    });
});
addAction("createTeam", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var user = data.user;
    var teamName = data.teamName;
    var teamNumber = data.teamNumber;
    var chosenCode = data.chosenCode;
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS TeamsForUsers (user TEXT, teamCode TEXT, teamName TEXT, position TEXT, first TEXT, last TEXT, teamNumber TEXT)");
        db.run("CREATE TABLE IF NOT EXISTS Teams (number TEXT, name TEXT, code TEXT)"); //number is text for a reason, don't change
        db.all("SELECT code FROM Teams WHERE code = '" + chosenCode + "'", function(err, results) {
            if (typeof(results) != "undefined" && results.length > 0) {
                res.end("team exists");
            } else {
                db.all("SELECT first, last FROM Users WHERE user = '"+user+"'", function(err, results){
                    if (typeof(results) != "undefined"&&results.length == 1){
                        var first = results[0].first;
                        var last = results[0].last;
                        db.run("INSERT INTO TeamsForUsers VALUES ('"+[user, chosenCode, teamName, "Admin", first, last, teamNumber].join("','")+"')");
                        db.run("INSERT INTO Teams VALUES ('" + [teamNumber, teamName, chosenCode].join("','") + "')");
                        res.end("added team");
                    }
                    else {
                        res.end("fail")
                    }
                });
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
        db.run("CREATE TABLE IF NOT EXISTS Users (user TEXT, pass TEXT, email TEXT, first TEXT, last TEXT, phone TEXT)");
        db.all("SELECT * FROM Users WHERE (user = '" + user + "' OR email = '" + user + "') AND pass = '" + pass + "'", function(err, results) {
            if (typeof(results) != "undefined" && results.length > 0) {
                var token = randomStr();
                var email = results[0].email;
                var username = results[0].user;
                var phone = results[0].phone;
                var firstName = results[0].first;
                var lastName = results[0].last;
                db.run("INSERT INTO Sessions VALUES ('" + [user, token].join("','") + "')");
                res.end(JSON.stringify({
                    "user": user,
                    "token": token,
                    "email": email,
                    "phone": phone,
                    "first": firstName,
                    "last": lastName
                }));
            } else {
                res.end("invalid login");
            }
        });
    });
});

/*
addAction("addEvent", "POST", function(req, res, get, post) {
    var user = get.user;
    var data = parseJSON(post);
    validateSession(user, get.token, function(valid) {
        if (valid) {
            db.serialize(function() {
                db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month INTEGER, day INTEGER, year INTEGER, time TEXT, event TEXT)");
                var insert = getInsertSql(user + "_Calendar", [data.month, data.day, data.year, data.time, data.event]);
                db.run(insert);
            });
            res.end("success");
        } else {
            res.end("invalid session");
        }
    });
});
*/

addAction("announce", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var user = data.user;
    var nameDate = data.nameDate;
    var text = data.text;
    var postNum = 1;
    var teamCode = data.teamCode;
    db.serialize(function() {
        db.all("SELECT * FROM Announcements WHERE teamCode='" + teamCode + "'", function(err, results) {
            if (results.length == 0) {
                postNum = 1
            } else {
                postNum = results[results.length - 1].postNum + 1;
            }
            db.run("CREATE TABLE IF NOT EXISTS Announcements (nameDate TEXT, text TEXT, teamCode TEXT, postNum INTEGER, user TEXT)");
            db.run("INSERT INTO Announcements VALUES ('" + [nameDate, text, teamCode, postNum, user].join("','") + "')");
            res.end("success");
        });
    });
});

addAction("getannouncements", "POST", function(req, res, get, post) {
    var data = parseJSON(post);
    var user = data.user;
    var teamCode = data.teamCode;
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS Announcements (nameDate TEXT, text TEXT, teamCode TEXT, postNum INTEGER, user TEXT)");
        db.all("SELECT * FROM Announcements WHERE teamCode = '" + teamCode + "'", function(err, results) {
            res.end(JSON.stringify(results));
        });
    });
});

/*
addAction("getEvents", "GET", function(req, res, get) {
    var user = get.user;
    validateSession(user, get.token, function(valid) {
        if (valid) {
            db.serialize(function() {
                db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month INTEGER, day INTEGER, year INTEGER, time TEXT, event TEXT)");
                db.all("SELECT * FROM " + user + "_Calendar", function(err, events) {
                    res.end(JSON.stringify(events));
                });
            });
        } else {
            res.end("invalid session");
        }
    });
});
*/

//Consider post data for token and search item (spaces)
addAction("searchUsers", "GET", function(req, res, get) {
    var searchItem = get.item;
    var results = [];
    db.serialize(function() {
        db.each("SELECT first, last FROM Users", function(err, user) {
            var name = user.first + " " + user.last;
            if (~name.toLowerCase().indexOf(searchItem.toLowerCase())) {
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
        if (valid) {
            db.serialize(function() {
                db.run("CREATE TABLE IF NOT EXISTS " + user + "_Calendar (month INTEGER, day INTEGER, year INTEGER, time TEXT, event TEXT)");
                db.all("SELECT * FROM " + user + "_Calendar WHERE event LIKE '%" + searchItem + "%'", function(err, events) {
                    if (typeof(events) != "undefined" && events.length > 0) {
                        results = events;
                    }
                    res.end(JSON.stringify(results));
                });
            });
        } else {
            res.end("invalid session");
        }
    });
});

function validateSession(user, token, cb) {
    db.all("SELECT * FROM Sessions WHERE user = '" + user + "' AND token = '" + token + "'", function(err, results) {
        cb(typeof(results) != "undefined" && results.length > 0);
    });
}

function randomStr() {
    var str = "";
    for (var i = 0; i < 32; i++) {
        var rand = Math.floor(Math.random() * 62);
        str += String.fromCharCode(rand + ((rand < 26) ? 97 : ((rand < 52) ? 39 : -4)));
    }
    return str;
}

function getInsertSql(table, arr) {
    if (!isValidInput(table)) {
        return null;
    }
    var strs = []
    for (var i = 0; i < arr.length; i++) {
        if (typeof(arr[i]) == "string") {
            strs.push("\"" + arr[i] + "\"");
        } else {
            strs.push(String(arr[i]));
        }
        if (!isValid(arr[i])) {
            return null;
        }
    }
    return "INSERT INTO " + table + " VALUES (" + strs.join(",") + ")";
}

function isValidInput(str) {
    for (var i = 0; i < str.length; i++) {
        var char = str.charAt(i);
        switch (true) {
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

io.listen(server).on("connection", function(socket) {
    socket.on("disconnect", function() {
        for (var i = 0; i < clients.length; i++) {
            if (clients[i].socket == socket) {
                for (var j = 0; j < clients.length; j++) {
                    if (clients[i].teamcode == clients[j].teamcode) {
                        //Fix the thing
                        clients[j].socket.emit("updateindicator", {
                            "user": clients[i].user,
                            "status": "offline"
                        });
                    }
                }
                clients.splice(i, 1);
                break;
            }
        }
    });
    socket.on("newmessage", function(data) {
        if (typeof(data) != "undefined" && data != "") {
            for (var i = 0; i < clients.length; i++) {
                if (clients[i].chatcode == data.chatcode) {
                    clients[i].socket.emit("message", data);
                } else {
                    for (var j = 0; j < data.recievers.length; j++) {
                        if (clients[i].user == data.recievers[j] && clients[i].user != data.user) {
                            clients[i].socket.emit("notification", data);
                        }
                    }
                }
            }
        }
    });
    //FIX ONLINE/OFFLINE INDICATOR WHEN TAB CLOSES AND ANOTHER IS OPEN
    socket.on("updateclient", function(data) {
        if (typeof(data) != "undefined" && data != "") {
            var isConnected = false;
            for (var i = 0; i < clients.length; i++) {
                if (socket == clients[i].socket) {
                    isConnected = true;
                    clients[i].chatcode = data.chatcode;
                    clients[i].user = data.user;
                    clients[i].teamcode = data.teamcode;
                    //clients[i].page = data.page; Use later
                    break;
                }
            }
            if (!isConnected) {
                clients.push({
                    "socket": socket,
                    "chatcode": data.chatcode,
                    "teamcode": data.teamcode,
                    "page": "use later",
                    "user": data.user
                });
                //console.log(JSON.stringify(clients[clients.length - 1]));
                for (var i = 0; i < clients.length; i++) {
                    if (clients[i].teamcode == data.teamcode) {
                        clients[i].socket.emit("updateindicator", {
                            "user": data.user,
                            "status": "online"
                        });
                    }
                }
            }
            socket.emit("updated", {});
        }
    });
});
