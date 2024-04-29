// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.ui.form.on("Leave Application", {
	setup: function(frm) {
		frm.set_query("leave_approver", function() {
			return {
				query: "hrms.hr.doctype.department_approver.department_approver.get_approvers",
				filters: {
					employee: frm.doc.employee,
					doctype: frm.doc.doctype
				}
			};
		});

		frm.set_query("employee", erpnext.queries.employee);
	},

	onload: function(frm) {
		// Ignore cancellation of doctype on cancel all.
		frm.ignore_doctypes_on_cancel_all = ["Leave Ledger Entry"];

		if (!frm.doc.posting_date) {
			frm.set_value("posting_date", frappe.datetime.get_today());
		}
		if (frm.doc.docstatus == 0) {
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_mandatory_approval",
				args: {
					doctype: frm.doc.doctype,
				},
				callback: function(r) {
					if (!r.exc && r.message) {
						frm.toggle_reqd("leave_approver", true);
					}
				}
			});
		}
	},

	validate: function(frm) {
		if (frm.doc.from_date === frm.doc.to_date && cint(frm.doc.half_day)) {
			frm.doc.half_day_date = frm.doc.from_date;
		} else if (frm.doc.half_day === 0) {
			frm.doc.half_day_date = "";
		}
		frm.toggle_reqd("half_day_date", cint(frm.doc.half_day));
	},

	make_dashboard: function(frm) {
		let leave_details;
		let lwps;

		if (frm.doc.employee) {
			frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_leave_details",
				async: false,
				args: {
					employee: frm.doc.employee,
					date: frm.doc.from_date || frm.doc.posting_date
				},
				callback: function(r) {
					if (!r.exc && r.message["leave_allocation"]) {
						leave_details = r.message["leave_allocation"];
					}
					if (!r.exc && r.message["leave_approver"]) {
						frm.set_value("leave_approver", r.message["leave_approver"]);
					}
					lwps = r.message["lwps"];
				}
			});

			$("div").remove(".form-dashboard-section.custom");

			frm.dashboard.add_section(
				frappe.render_template("leave_application_dashboard", {
					data: leave_details
				}),
				__("Allocated Leaves")
			);
			frm.dashboard.show();

			let allowed_leave_types = Object.keys(leave_details);
			// lwps should be allowed for selection as they don't have any allocation
			allowed_leave_types = allowed_leave_types.concat(lwps);

			frm.set_query("leave_type", function() {
				return {
					filters: [
						["leave_type_name", "in", allowed_leave_types]
					]
				};
			});
		}
	},

	refresh: function(frm) {
		if (frm.is_new()) {
			frm.trigger("calculate_total_days");
		}

		frm.set_intro("");
		if (frm.doc.__islocal && !in_list(frappe.user_roles, "Employee")) {
			frm.set_intro(__("Fill the form and save it"));
		}

		frm.trigger("set_employee");
		if(frm.doc.custom_hourly && frm.doc.company) {
			frm.set_df_property("to_date", "read_only", 1);
			frm.set_value("to_date", frm.doc.from_date);
			frm.trigger("check_company");
		}
	},

	async set_employee(frm) {
		if (frm.doc.employee) return;

		const employee = await hrms.get_current_employee(frm);
		if (employee) {
			frm.set_value("employee", employee);
		}
	},

	employee: function(frm) {
		frm.trigger("make_dashboard");
		frm.trigger("get_leave_balance");
		frm.trigger("set_leave_approver");
		frm.trigger("check_company")
	},

	leave_approver: function(frm) {
		if (frm.doc.leave_approver) {
			frm.set_value("leave_approver_name", frappe.user.full_name(frm.doc.leave_approver));
		}
	},

	leave_type: function(frm) {
		frm.trigger("get_leave_balance");
	},

	half_day: function(frm) {
		if (frm.doc.half_day) {
			if (frm.doc.from_date == frm.doc.to_date) {
				frm.set_value("half_day_date", frm.doc.from_date);
			} else {
				frm.trigger("half_day_datepicker");
			}
		} else {
			frm.set_value("half_day_date", "");
		}
		frm.trigger("calculate_total_days");
	},

	from_date: function(frm) {
		frm.trigger("make_dashboard");
		frm.trigger("half_day_datepicker");
		frm.trigger("calculate_total_days");
		if (frm.doc.custom_hourly) {
			frm.set_value("to_date", frm.doc.from_date);
		}
	},

	to_date: function(frm) {
		frm.trigger("make_dashboard");
		frm.trigger("half_day_datepicker");
		frm.trigger("calculate_total_days");
		if (frm.doc.custom_hourly) {
			frm.set_value("to_date", frm.doc.from_date);
		}
	},
	custom_from_time: function(frm) {
		if(frm.doc.custom_from_time) {
			if (frm.doc.custom_from_time < "08:30:00" && frm.doc.company != "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time before 08:30"));
			}
			if (frm.doc.custom_from_time > "17:30:00" && frm.doc.company != "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time after 17:30"));
				frm.set_value("custom_from_time", "17:30:00");
				frm.refresh_field("custom_from_time");
			}
			if (frm.doc.custom_from_time < "09:00:00" && frm.doc.company == "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time before 09:00"));
			}
			if (frm.doc.custom_from_time > "18:00:00" && frm.doc.company == "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time after 18:00"));
				frm.set_value("custom_from_time", "18:00:00");
				frm.refresh_field("custom_from_time");
			}
		}
		frm.trigger("calculate_total_days");
		frm.trigger("check_from_time_minutes");
	},
	custom_to_time: function(frm) {
		if(frm.doc.custom_to_time) {
			if (frm.doc.custom_to_time < "08:30:00" && frm.doc.company != "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time before 08:30"));
			}
			if (frm.doc.custom_to_time > "17:30:00" && frm.doc.company != "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time after 17:30"));
				frm.set_value("custom_to_time", "17:30:00");
				frm.refresh_field("custom_to_time");
			}
			if (frm.doc.custom_to_time < "09:00:00" && frm.doc.company == "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time before 09:00"));
			}
			if (frm.doc.custom_to_time > "18:00:00" && frm.doc.company == "Ekin Software Teknoloji") {
				frappe.msgprint(__("You can not select time after 18:00"));
				frm.set_value("custom_to_time", "18:00:00");
				frm.refresh_field("custom_to_time");
			}
		}
		frm.trigger("calculate_total_days");
		frm.trigger("check_to_time_minutes");
	},
	check_from_time_minutes: function(frm) {
		let from_time;
		if (frm.fields_dict.custom_from_time.datepicker) {
			from_time = frm.fields_dict.custom_from_time.datepicker.timepicker;
			if (frm.doc.company != "Ekin Software Teknoloji") {
				if (from_time.displayHours == 8) {
					from_time.opts.minMinutes = 30
				}
				else if (from_time.displayHours == 17) {
					from_time.opts.maxMinutes = 30
				}
				else if ((from_time.displayHours > 8 && from_time.displayHours < 17) || ("08:30:00" < frm.doc.custom_to_time < "17:30:00")) {
					from_time.opts.maxMinutes = 59
				}
			}
			else if (frm.doc.company == "Ekin Software Teknoloji") {
				if (from_time.displayHours == 18) {
					from_time.opts.maxMinutes = 0
				} else {
					from_time.opts.maxMinutes = 59
				}
				if (from_time.displayHours == 17) {
					frm.fields_dict.custom_from_time.datepicker.hide();
					frm.fields_dict.custom_from_time.datepicker.show();
				}
			}
		}
	},
	check_to_time_minutes: function(frm) {
		let to_time;

		if (frm.fields_dict.custom_to_time.datepicker) {
			to_time = frm.fields_dict.custom_to_time.datepicker.timepicker;
			if (frm.doc.company != "Ekin Software Teknoloji") {
				if (to_time.displayHours == 8) {
					to_time.opts.minMinutes = 30
				}
				else if (to_time.displayHours == 17) {
					to_time.opts.maxMinutes = 30
				}
				else if ((to_time.displayHours > 8 && to_time.displayHours < 17) || ("08:30:00" < frm.doc.custom_to_time < "17:30:00")) {
					to_time.opts.maxMinutes = 59
				}
			}
			else if (frm.doc.company == "Ekin Software Teknoloji") {
				if (to_time.displayHours == 18) {
					to_time.opts.maxMinutes = 0
				} else {
					to_time.opts.maxMinutes = 59
				}
				if (to_time.displayHours == 17) {
					frm.fields_dict.custom_to_time.datepicker.hide();
					frm.fields_dict.custom_to_time.datepicker.show();
				}
			}
		}
	},
	custom_hourly: function(frm) {
		if (frm.doc.custom_hourly == 1) {
			frm.set_df_property("to_date", "read_only", 1);
			frm.set_value("to_date", frm.doc.from_date);
			frm.trigger("check_company");
		}
		if (frm.doc.custom_hourly == 0) {
			frm.set_df_property("to_date", "read_only", 0);
			frm.set_value("to_date", "")
			frm.set_value("custom_from_time", "");
			frm.set_value("custom_to_time", "");
			frm.refresh_field("to_date");
			frm.refresh_field("custom_from_time");
			frm.refresh_field("custom_to_time");
		}
	},
	check_company: function(frm) {
		let to_time;
		if (frm.fields_dict.custom_to_time.datepicker) {
			to_time = frm.fields_dict.custom_to_time.datepicker.timepicker;
		}
		let from_time;
		if (frm.fields_dict.custom_from_time.datepicker) {
			from_time = frm.fields_dict.custom_from_time.datepicker.timepicker;
		}
		if (frm.doc.employee) {
			if (frm.doc.company != "Ekin Software Teknoloji") {
				if(from_time) {
					from_time.opts.minHours = 8
					from_time.opts.maxHours = 17
				}
				if(to_time) {
					to_time.opts.minHours = 8
					to_time.opts.maxHours = 17
				}
				if(!frm.doc.custom_from_time) {
					frm.set_value("custom_from_time", "08:30:00");
					frm.refresh_field("custom_from_time");
				}
				if(!frm.doc.custom_to_time) {
					frm.set_value("custom_to_time", "17:30:00");
					frm.refresh_field("custom_to_time");
				}
			}
			else {
				if(from_time) {
					from_time.opts.minHours = 9
					from_time.opts.maxHours = 18
				}
				if(to_time) {
					to_time.opts.minHours = 9
					to_time.opts.maxHours = 18
				}
				if(!frm.doc.custom_from_time) {
					frm.set_value("custom_from_time", "09:00:00");
					frm.refresh_field("custom_from_time");
				}
				if(!frm.doc.custom_to_time) {
					frm.set_value("custom_to_time", "18:00:00");
					frm.refresh_field("custom_to_time");
				}
			}
		}
	},
	half_day_date(frm) {
		frm.trigger("calculate_total_days");
	},

	half_day_datepicker: function(frm) {
		frm.set_value("half_day_date", "");
		let half_day_datepicker = frm.fields_dict.half_day_date.datepicker;
		if(half_day_datepicker) {
			half_day_datepicker.update({
				minDate: frappe.datetime.str_to_obj(frm.doc.from_date),
				maxDate: frappe.datetime.str_to_obj(frm.doc.to_date)
			});
		}
	},
	get_leave_balance: function(frm) {
		if (frm.doc.docstatus === 0 && frm.doc.employee && frm.doc.leave_type && frm.doc.from_date && frm.doc.to_date) {
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_leave_balance_on",
				args: {
					employee: frm.doc.employee,
					date: frm.doc.from_date,
					to_date: frm.doc.to_date,
					leave_type: frm.doc.leave_type,
					consider_all_leaves_in_the_allocation_period: 1
				},
				callback: function (r) {
					if (!r.exc && r.message) {
						frm.set_value("leave_balance", r.message);
					} else {
						frm.set_value("leave_balance", "0");
					}
				}
			});
		}
	},

	calculate_total_days: function(frm) {
		if (frm.doc.from_date && frm.doc.to_date && frm.doc.employee && frm.doc.leave_type) {
			let from_date = Date.parse(frm.doc.from_date);
			let to_date = Date.parse(frm.doc.to_date);

			if (to_date < from_date) {
				frappe.msgprint(__("To Date cannot be less than From Date"));
				frm.set_value("to_date", "");
				return;
			}
			// server call is done to include holidays in leave days calculations
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_number_of_leave_days",
				args: {
					"employee": frm.doc.employee,
					"leave_type": frm.doc.leave_type,
					"from_date": frm.doc.from_date,
					"to_date": frm.doc.to_date,
					"custom_from_time": frm.doc.custom_from_time,
					"custom_to_time": frm.doc.custom_to_time,
					"custom_hourly": frm.doc.custom_hourly,
					"half_day": frm.doc.half_day,
					"half_day_date": frm.doc.half_day_date,
				},
				callback: function(r) {
					if (r && r.message) {
						frm.set_value("total_leave_days", r.message);
						frm.trigger("get_leave_balance");
					}
				}
			});
		}
	},

	set_leave_approver: function(frm) {
		if (frm.doc.employee) {
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_leave_approver",
				args: {
					"employee": frm.doc.employee,
				},
				callback: function(r) {
					if (r && r.message) {
						frm.set_value("leave_approver", r.message);
					}
				}
			});
		}
	}
});

frappe.tour["Leave Application"] = [
	{
		fieldname: "employee",
		title: "Employee",
		description: __("Select the Employee.")
	},
	{
		fieldname: "leave_type",
		title: "Leave Type",
		description: __("Select type of leave the employee wants to apply for, like Sick Leave, Privilege Leave, Casual Leave, etc.")
	},
	{
		fieldname: "from_date",
		title: "From Date",
		description: __("Select the start date for your Leave Application.")
	},
	{
		fieldname: "to_date",
		title: "To Date",
		description: __("Select the end date for your Leave Application.")
	},
	{
		fieldname: "half_day",
		title: "Half Day",
		description: __("To apply for a Half Day check 'Half Day' and select the Half Day Date")
	},
	{
		fieldname: "leave_approver",
		title: "Leave Approver",
		description: __("Select your Leave Approver i.e. the person who approves or rejects your leaves.")
	}
];
