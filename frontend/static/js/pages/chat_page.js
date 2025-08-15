var ChatPage = function() {
	var pub = {};
	var chatLogId;
	var userId;
	var lastMessageId = 0;
	var container;
	var header;
	var card;
	var messageBox;
	var inputBox;
	var form;
	var messageInput;
	var messageSubmit;

	var constructor = function() {
		const urlParams = new URLSearchParams(window.location.search);
		chatLogId = urlParams.get("chat_log_id");
		userId = parseInt(getCookie("user_id"), 10);

		container = document.createElement("div");
		container.className = "chat-page";

		header = Header();
		container.appendChild(header.getContainer());

		card = document.createElement("div");
		card.className = "card";
		container.appendChild(card);

		messageBox = document.createElement("div");
		messageBox.className = "message-box";
		container.appendChild(messageBox);

		inputBox = document.createElement("div");
		inputBox.className = "input-box";
		container.appendChild(inputBox);

		form = document.createElement("form");
		form.action = "POST";
		form.onsubmit = function() {
			sendMessage(messageInput.value).then(function(data) {
				console.log("sent!", data);
			})
			.catch(function(err) {
				console.log(err);
				window.location.search = `?path=/login`;
			});

			return false;
		};
		inputBox.appendChild(form);

		messageInput = document.createElement("textarea");
		messageInput.className = "message-input";
		messageInput.name = "message";
		form.appendChild(messageInput);

		messageSubmit = document.createElement("input");
		messageSubmit.type = "submit";
		messageSubmit.className = "message-submit";
		messageSubmit.value = "SEND";
		form.appendChild(messageSubmit);

		getChatLog().then(function(data) {
			var chatLog = data;
			card.textContent = data.statement;
		})
		.catch(function(err) {
			console.log(err);
			window.location.search = `?path=/login`;
		});
		getMessages().then(function(data) {
			renderMessages(data.messages);
			startPollMessages();
		})
		.catch(function(err) {
			console.log(err);
			window.location.search = `?path=/login`;
		});
	};

	pub.getContainer = function() {
		return container;
	};

	var getMessages = async function() {
		try {
			const response = await fetch(`${API_URL}/chat_log_message/chat_log/${chatLogId}`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${(await window.cookieStore.get("token")).value}`,
					'Content-Type': 'application/json'
				},
				body: undefined, //JSON.stringify(dataToSend)
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const responseData = await response.json();
			return responseData;
		} catch (error) {
			throw error;
		}
	};

	var getChatLog = async function() {
		try {
			const response = await fetch(`${API_URL}/chat_log/${chatLogId}`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${(await window.cookieStore.get("token")).value}`,
					'Content-Type': 'application/json'
				},
				body: undefined, //JSON.stringify(dataToSend)
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const responseData = await response.json();
			return responseData;
		} catch (error) {
			throw error;
		}
	};

	var sendMessage = async function(message) {
		const dataToSend = {
			message: message,
		};

		try {
			const response = await fetch(`${API_URL}/chat_log_message/chat_log/${chatLogId}`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${(await window.cookieStore.get("token")).value}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(dataToSend)
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const responseData = await response.json();
			return responseData;
		} catch (error) {
			throw error;
		}
	};

	var pollMessages = async function() {
		try {
			const response = await fetch(`${API_URL}/chat_log_message/chat_log/${chatLogId}/message_offset/${lastMessageId}`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${(await window.cookieStore.get("token")).value}`,
					'Content-Type': 'application/json'
				},
				body: undefined, //JSON.stringify(dataToSend)
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const responseData = await response.json();
			return responseData;
		} catch (error) {
			throw error;
		}
	};

	var startPollMessages = function() {
		pollMessages().then(function(data) {
			renderMessages(data.messages);
			startPollMessages();
		})
		.catch(function(err) {
			console.log(err);
			window.location.search = `?path=/login`;
		});
	};

	var renderMessages = function(messages) {
		for (var i = 0; i < messages.length; i++) {
			var message = messages[i];
			var bubble = SelfChatBubble();
			if (message.user_id !== userId) {
				bubble = OtherChatBubble();
			}
			bubble.setMessage(message.message);
			messageBox.appendChild(bubble.getContainer());
			lastMessageId = message.id;
			window.scrollTo(0, document.body.scrollHeight);
		}
	};

	constructor();
	return pub;
};