var OtherChatBubble = function() {
	var pub = {};
	var container;
	var user;
	var message;

	var constructor = function() {
		container = document.createElement("div");
		container.className = "chat-bubble other-chat-bubble";

		message = document.createElement("div");
		message.className = "message";
		message.textContent = "";
		container.appendChild(message);

		user = document.createElement("div");
		user.className = "user";
		user.style.backgroundImage = "url('https://upload.wikimedia.org/wikipedia/commons/9/99/Sample_User_Icon.png')";
		user.textContent = "";
		container.appendChild(user);
	};

	pub.getContainer = function() {
		return container;
	};

	pub.setMessage = function(msg) {
		message.textContent = msg;
	};

	constructor();
	return pub;
};