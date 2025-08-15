var PositionsPage = function() {
	var pub = {};
	var container;
	var header;
	var card;
	var loading;
	var statement;
	var agree;
	var disagree;
	var pass;
	var chat;
	var positionsQueue = [];
	var currentPosition;

	var constructor = function() {
		container = document.createElement("div");
		container.className = "positions-page";

		header = Header();
		container.appendChild(header.getContainer());

		card = document.createElement("div");
		card.className = "card";
		container.appendChild(card);

		loading = document.createElement("div");
		loading.className = "loading";
		loading.textContent = "LOADING";
		card.appendChild(loading);

		statement = document.createElement("div");
		statement.className = "statement";
		card.appendChild(statement);

		agree = document.createElement("div");
		agree.className = "respond agree";
		agree.textContent = "agree";
		agree.onclick = function() {
			respond('agree');
		};
		card.appendChild(agree);

		disagree = document.createElement("div");
		disagree.className = "respond disagree";
		disagree.textContent = "disagree";
		disagree.onclick = function() {
			respond('disagree');
		};
		card.appendChild(disagree);

		pass = document.createElement("div");
		pass.className = "respond pass";
		pass.textContent = "pass";
		pass.onclick = function() {
			respond('pass');
		};
		card.appendChild(pass);

		chat = document.createElement("div");
		chat.className = "respond chat";
		chat.textContent = "chat";
		chat.onclick = function() {
			respond('chat').then(function(data) {
				doChat().then(function(data2) {
					window.location.search = `?path=/chat&chat_log_id=${data2.id}`;
				})
				.catch(function(err) {
					console.log(err);
					window.location.search = `?path=/login`;
				});
			})
			.catch(function(err) {
				console.log(err);
				window.location.search = `?path=/login`;
			});
		};
		card.appendChild(chat);

		let positions = getPositions();
		positions.then(function(data) {
			positionsQueue = data.positions;
			pub.nextPosition();
		})
		.catch(function(err) {
			console.log(err);
			window.location.search = `?path=/login`;
		})
		.finally(function() {
			pub.hideLoading();
		});
	};

	pub.getContainer = function() {
		return container;
	};

	pub.hideLoading = function() {
		loading.style.display = "none";
	};

	pub.showLoading = function() {
		loading.style.display = "";
	};

	pub.nextPosition = function() {
		currentPosition = positionsQueue.shift();
		if (!currentPosition) {
			statement.textContent = "No more positions left!";
		} else {
			statement.textContent = currentPosition.statement;
		}
	};

	var getPositions = async function() {
		try {
			const response = await fetch(`${API_URL}/position/queue`, {
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

	var respond = async function(result) {
		const dataToSend = {
			result: result,
		};

		try {
			const response = await fetch(`${API_URL}/user_position/position/${currentPosition.id}/respond`, {
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

	var doChat = async function() {
		const dataToSend = {
		};

		try {
			const response = await fetch(`${API_URL}/chat_log/position/${currentPosition.id}`, {
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

	constructor();
	return pub;
};