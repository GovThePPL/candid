var Header = function() {
	var pub = {};
	var container;
	var logo;
	var back;
	var kudos;
	var user;

	var constructor = function() {
		container = document.createElement("div");
		container.className = "header";

		back = document.createElement("div");
		back.className = "back";
		back.style.display = "none";
		back.textContent = "←";
		container.appendChild(back);

		logo = document.createElement("div");
		logo.className = "logo";
		logo.textContent = "Candid";
		container.appendChild(logo);

		user = document.createElement("div");
		user.className = "user";
		user.style.backgroundImage = "url('https://upload.wikimedia.org/wikipedia/commons/9/99/Sample_User_Icon.png')";
		user.textContent = "";
		container.appendChild(user);

		kudos = document.createElement("div");
		kudos.className = "kudos";
		kudos.textContent = "★ 12";
		container.appendChild(kudos);

	};

	pub.getContainer = function() {
		return container;
	};

	constructor();
	return pub;
};