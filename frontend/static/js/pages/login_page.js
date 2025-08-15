var LoginPage = function() {
	var pub = {};
	var container;
	var card;
	var logo;
	var form;
	var emailInput;
	var passwordInput;
	var loginSubmit;

	var constructor = function() {
		container = document.createElement("div");
		container.className = "login-page";

		card = document.createElement("div");
		card.className = "card";
		container.appendChild(card);

		logo = document.createElement("div");
		logo.className = "logo";
		logo.textContent = "Candid";
		card.appendChild(logo);

		form = document.createElement("form");
		form.className = "form";
		form.method = "POST";
		form.onsubmit = function() {
			login(emailInput.value, passwordInput.value).then(function(data) {
				window.cookieStore.set("user_id", data.id);
				window.cookieStore.set("token", data.token);
				window.location.search = `?path=/positions`;
			});

			return false;
		};
		card.appendChild(form);

		emailInput = document.createElement("input");
		emailInput.type = "email";
		emailInput.placeholder = "Email";
		emailInput.className = "email-input";
		emailInput.name = "email";
		form.appendChild(emailInput);

		passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.placeholder = "Password";
		passwordInput.className = "password-input";
		passwordInput.name = "password";
		form.appendChild(passwordInput);

		loginSubmit = document.createElement("input");
		loginSubmit.type = "submit";
		loginSubmit.className = "login-submit";
		loginSubmit.value = "LOGIN";
		form.appendChild(loginSubmit);
	};

	pub.getContainer = function() {
		return container;
	};

	var login = async function(email, password) {
		const dataToSend = {
			email: email,
			password: password,
		};

		try {
			const response = await fetch(`${API_URL}/user/login`, {
				method: 'POST',
				headers: {
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