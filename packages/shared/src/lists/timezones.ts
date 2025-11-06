type timezone = {
	offset: string;
	label: string;
	region: string;
};

export const TIMEZONES: timezone[] = [
	{
		offset: "UTC-11:00",
		label: "Midway Island, American Samoa",
		region: "Pacific/Midway",
	},
	{
		offset: "UTC-10:00",
		label: "Aleutian Islands",
		region: "America/Adak",
	},
	{
		offset: "UTC-10:00",
		label: "Hawaii",
		region: "Pacific/Honolulu",
	},
	{
		offset: "UTC-09:30",
		label: "Marquesas Islands",
		region: "Pacific/Marquesas",
	},
	{
		offset: "UTC-09:00",
		label: "Alaska",
		region: "America/Anchorage",
	},
	{
		offset: "UTC-08:00",
		label: "Baja California",
		region: "America/Tijuana",
	},
	{
		offset: "UTC-08:00",
		label: "Pacific Time US and Canada",
		region: "America/Los_Angeles",
	},
	{
		offset: "UTC-07:00",
		label: "Arizona",
		region: "America/Phoenix",
	},
	{
		offset: "UTC-07:00",
		label: "Mountain Time US and Canada, Navajo Nation",
		region: "America/Denver",
	},
	{
		offset: "UTC-06:00",
		label: "Central America",
		region: "America/Belize",
	},
	{
		offset: "UTC-06:00",
		label: "Central Time (US and Canada)",
		region: "America/Chicago",
	},
	{
		offset: "UTC-06:00",
		label: "Chihuahua, La Paz, Mazatlan",
		region: "America/Chihuahua",
	},
	{
		offset: "UTC-06:00",
		label: "Easter Island",
		region: "Pacific/Easter",
	},
	{
		offset: "UTC-06:00",
		label: "Guadalajara, Mexico City, Monterrey",
		region: "America/Mexico_City",
	},
	{
		offset: "UTC-06:00",
		label: "Saskatchewan",
		region: "America/Regina",
	},
	{
		offset: "UTC-05:00",
		label: "Bogota, Lima, Quito",
		region: "America/Bogota",
	},
	{
		offset: "UTC-05:00",
		label: "Chetumal",
		region: "America/Cancun",
	},
	{
		offset: "UTC-05:00",
		label: "Eastern Time (US and Canada)",
		region: "America/New_York",
	},
	{
		offset: "UTC-05:00",
		label: "Haiti",
		region: "America/Port-au-Prince",
	},
	{
		offset: "UTC-05:00",
		label: "Havana",
		region: "America/Havana",
	},
	{
		offset: "UTC-05:00",
		label: "Indiana (East)",
		region: "America/Indiana/Indianapolis",
	},
	{
		offset: "UTC-05:00",
		label: "Turks and Caicos",
		region: "America/Grand_Turk",
	},
	{
		offset: "UTC-04:00",
		label: "Asuncion",
		region: "America/Asuncion",
	},
	{
		offset: "UTC-04:00",
		label: "Atlantic Time (Canada)",
		region: "America/Halifax",
	},
	{
		offset: "UTC-04:00",
		label: "Caracas",
		region: "America/Caracas",
	},
	{
		offset: "UTC-04:00",
		label: "Cuiaba",
		region: "America/Cuiaba",
	},
	{
		offset: "UTC-04:00",
		label: "Georgetown, La Paz, Manaus, San Juan",
		region: "America/Manaus",
	},
	{
		offset: "UTC-04:00",
		label: "Santiago",
		region: "America/Santiago",
	},
	{
		offset: "UTC-03:30",
		label: "Newfoundland",
		region: "America/St_Johns",
	},
	{
		offset: "UTC-03:00",
		label: "Araguaina",
		region: "America/Fortaleza",
	},
	{
		offset: "UTC-03:00",
		label: "Brasilia",
		region: "America/Sao_Paulo",
	},
	{
		offset: "UTC-03:00",
		label: "Cayenne, Fortaleza",
		region: "America/Cayenne",
	},
	{
		offset: "UTC-03:00",
		label: "City of Buenos Aires",
		region: "America/Buenos_Aires",
	},
	{
		offset: "UTC-03:00",
		label: "Greenland",
		region: "America/Godthab",
	},
	{
		offset: "UTC-03:00",
		label: "Montevideo",
		region: "America/Montevideo",
	},
	{
		offset: "UTC-03:00",
		label: "Saint Pierre and Miquelon",
		region: "America/Miquelon",
	},
	{
		offset: "UTC-03:00",
		label: "Salvador",
		region: "America/Bahia",
	},
	{
		offset: "UTC-02:00",
		label: "Fernando de Noronha",
		region: "America/Noronha",
	},
	{
		offset: "UTC-01:00",
		label: "Azores",
		region: "Atlantic/Azores",
	},
	{
		offset: "UTC-01:00",
		label: "Cabo Verde Islands",
		region: "Atlantic/Cape_Verde",
	},
	{
		offset: "UTC",
		label: "Dublin, Edinburgh, Lisbon, London",
		region: "Europe/London",
	},
	{
		offset: "UTC",
		label: "Monrovia, Reykjavik",
		region: "Africa/Monrovia",
	},
	{
		offset: "UTC+01:00",
		label: "Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
		region: "Europe/Amsterdam",
	},
	{
		offset: "UTC+01:00",
		label: "Belgrade, Bratislava, Budapest, Ljubljana, Prague",
		region: "Europe/Belgrade",
	},
	{
		offset: "UTC+01:00",
		label: "Brussels, Copenhagen, Madrid, Paris",
		region: "Europe/Brussels",
	},
	{
		offset: "UTC+01:00",
		label: "Sarajevo, Skopje, Warsaw, Zagreb",
		region: "Europe/Warsaw",
	},
	{
		offset: "UTC+01:00",
		label: "West Central Africa",
		region: "Africa/Algiers",
	},
	{
		offset: "UTC+01:00",
		label: "Casablanca",
		region: "Africa/Casablanca",
	},
	{
		offset: "UTC+01:00",
		label: "Windhoek",
		region: "Africa/Windhoek",
	},
	{
		offset: "UTC+02:00",
		label: "Athens, Bucharest",
		region: "Europe/Athens",
	},
	{
		offset: "UTC+02:00",
		label: "Beirut",
		region: "Asia/Beirut",
	},
	{
		offset: "UTC+02:00",
		label: "Cairo",
		region: "Africa/Cairo",
	},
	{
		offset: "UTC+02:00",
		label: "Damascus",
		region: "Asia/Damascus",
	},
	{
		offset: "UTC+02:00",
		label: "Gaza, Hebron",
		region: "Asia/Gaza",
	},
	{
		offset: "UTC+02:00",
		label: "Harare, Pretoria",
		region: "Africa/Harare",
	},
	{
		offset: "UTC+02:00",
		label: "Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius",
		region: "Europe/Helsinki",
	},
	{
		offset: "UTC+02:00",
		label: "Jerusalem",
		region: "Asia/Jerusalem",
	},
	{
		offset: "UTC+02:00",
		label: "Kaliningrad",
		region: "Europe/Kaliningrad",
	},
	{
		offset: "UTC+02:00",
		label: "Tripoli",
		region: "Africa/Tripoli",
	},
	{
		offset: "UTC+03:00",
		label: "Amman",
		region: "Asia/Amman",
	},
	{
		offset: "UTC+03:00",
		label: "Baghdad",
		region: "Asia/Baghdad",
	},
	{
		offset: "UTC+03:00",
		label: "Istanbul",
		region: "Asia/Istanbul",
	},
	{
		offset: "UTC+03:00",
		label: "Kuwait, Riyadh",
		region: "Asia/Kuwait",
	},
	{
		offset: "UTC+03:00",
		label: "Minsk",
		region: "Europe/Minsk",
	},
	{
		offset: "UTC+03:00",
		label: "Moscow, St. Petersburg",
		region: "Europe/Moscow",
	},
	{
		offset: "UTC+03:00",
		label: "Nairobi",
		region: "Africa/Nairobi",
	},
	{
		offset: "UTC+03:30",
		label: "Tehran",
		region: "Asia/Tehran",
	},
	{
		offset: "UTC+04:00",
		label: "Abu Dhabi, Muscat",
		region: "Asia/Muscat",
	},
	{
		offset: "UTC+04:00",
		label: "Astrakhan, Ulyanovsk, Volgograd",
		region: "Europe/Astrakhan",
	},
	{
		offset: "UTC+04:00",
		label: "Baku",
		region: "Asia/Baku",
	},
	{
		offset: "UTC+04:00",
		label: "Izhevsk, Samara",
		region: "Europe/Samara",
	},
	{
		offset: "UTC+04:00",
		label: "Port Louis",
		region: "Indian/Mauritius",
	},
	{
		offset: "UTC+04:00",
		label: "Tbilisi",
		region: "Asia/Tbilisi",
	},
	{
		offset: "UTC+04:00",
		label: "Yerevan",
		region: "Asia/Yerevan",
	},
	{
		offset: "UTC+04:30",
		label: "Kabul",
		region: "Asia/Kabul",
	},
	{
		offset: "UTC+05:00",
		label: "Tashkent, Ashgabat",
		region: "Asia/Tashkent",
	},
	{
		offset: "UTC+05:00",
		label: "Ekaterinburg",
		region: "Asia/Yekaterinburg",
	},
	{
		offset: "UTC+05:00",
		label: "Islamabad, Karachi",
		region: "Asia/Karachi",
	},
	{
		offset: "UTC+05:00",
		label: "Astana",
		region: "Asia/Almaty",
	},
	{
		offset: "UTC+05:30",
		label: "Chennai, Kolkata, Mumbai, New Delhi",
		region: "Asia/Kolkata",
	},
	{
		offset: "UTC+05:30",
		label: "Sri Jayawardenepura",
		region: "Asia/Colombo",
	},
	{
		offset: "UTC+05:45",
		label: "Kathmandu",
		region: "Asia/Katmandu",
	},
	{
		offset: "UTC+06:00",
		label: "Dhaka",
		region: "Asia/Dhaka",
	},
	{
		offset: "UTC+06:30",
		label: "Yangon (Rangoon)",
		region: "Asia/Rangoon",
	},
	{
		offset: "UTC+07:00",
		label: "Novosibirsk",
		region: "Asia/Novosibirsk",
	},
	{
		offset: "UTC+07:00",
		label: "Bangkok, Hanoi, Jakarta",
		region: "Asia/Bangkok",
	},
	{
		offset: "UTC+07:00",
		label: "Barnaul, Gorno-Altaysk",
		region: "Asia/Barnaul",
	},
	{
		offset: "UTC+07:00",
		label: "Hovd",
		region: "Asia/Hovd",
	},
	{
		offset: "UTC+07:00",
		label: "Krasnoyarsk",
		region: "Asia/Krasnoyarsk",
	},
	{
		offset: "UTC+07:00",
		label: "Tomsk",
		region: "Asia/Tomsk",
	},
	{
		offset: "UTC+08:00",
		label: "Beijing, Chongqing, Hong Kong SAR, Urumqi",
		region: "Asia/Chongqing",
	},
	{
		offset: "UTC+08:00",
		label: "Irkutsk",
		region: "Asia/Irkutsk",
	},
	{
		offset: "UTC+08:00",
		label: "Kuala Lumpur, Singapore",
		region: "Asia/Kuala_Lumpur",
	},
	{
		offset: "UTC+08:00",
		label: "Perth",
		region: "Australia/Perth",
	},
	{
		offset: "UTC+08:00",
		label: "Taipei",
		region: "Asia/Taipei",
	},
	{
		offset: "UTC+08:00",
		label: "Ulaanbaatar",
		region: "Asia/Ulaanbaatar",
	},
	{
		offset: "UTC+08:45",
		label: "Eucla",
		region: "Australia/Eucla",
	},
	{
		offset: "UTC+09:00",
		label: "Chita",
		region: "Asia/Chita",
	},
	{
		offset: "UTC+09:00",
		label: "Osaka, Sapporo, Tokyo",
		region: "Asia/Tokyo",
	},
	{
		offset: "UTC+09:00",
		label: "Pyongyang",
		region: "Asia/Pyongyang",
	},
	{
		offset: "UTC+09:00",
		label: "Seoul",
		region: "Asia/Seoul",
	},
	{
		offset: "UTC+09:00",
		label: "Yakutsk",
		region: "Asia/Yakutsk",
	},
	{
		offset: "UTC+09:30",
		label: "Adelaide",
		region: "Australia/Adelaide",
	},
	{
		offset: "UTC+09:30",
		label: "Darwin",
		region: "Australia/Darwin",
	},
	{
		offset: "UTC+10:00",
		label: "Brisbane",
		region: "Australia/Brisbane",
	},
	{
		offset: "UTC+10:00",
		label: "Canberra, Melbourne, Sydney",
		region: "Australia/Canberra",
	},
	{
		offset: "UTC+10:00",
		label: "Guam, Port Moresby",
		region: "Pacific/Guam",
	},
	{
		offset: "UTC+10:00",
		label: "Hobart",
		region: "Australia/Hobart",
	},
	{
		offset: "UTC+10:00",
		label: "Vladivostok",
		region: "Asia/Vladivostok",
	},
	{
		offset: "UTC+10:30",
		label: "Lord Howe Island",
		region: "Australia/Lord_Howe",
	},
	{
		offset: "UTC+11:00",
		label: "Bougainville Island",
		region: "Pacific/Bougainville",
	},
	{
		offset: "UTC+11:00",
		label: "Chokurdakh",
		region: "Asia/Srednekolymsk",
	},
	{
		offset: "UTC+11:00",
		label: "Magadan",
		region: "Asia/Magadan",
	},
	{
		offset: "UTC+11:00",
		label: "Norfolk Island",
		region: "Pacific/Norfolk",
	},
	{
		offset: "UTC+11:00",
		label: "Sakhalin",
		region: "Asia/Sakhalin",
	},
	{
		offset: "UTC+11:00",
		label: "Solomon Islands, New Caledonia",
		region: "Pacific/Guadalcanal",
	},
	{
		offset: "UTC+12:00",
		label: "Anadyr, Petropavlovsk-Kamchatsky",
		region: "Asia/Anadyr",
	},
	{
		offset: "UTC+12:00",
		label: "Auckland, Wellington",
		region: "Pacific/Auckland",
	},
	{
		offset: "UTC+12:00",
		label: "Fiji Islands",
		region: "Pacific/Fiji",
	},
	{
		offset: "UTC+12:45",
		label: "Chatham Islands",
		region: "Pacific/Chatham",
	},
	{
		offset: "UTC+13:00",
		label: "Nuku'alofa",
		region: "Pacific/Tongatapu",
	},
	{
		offset: "UTC+13:00",
		label: "Samoa",
		region: "Pacific/Apia",
	},
	{
		offset: "UTC+14:00",
		label: "Kiritimati Island",
		region: "Pacific/Kiritimati",
	},
];
