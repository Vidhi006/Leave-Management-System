$(document).ready(function () {

    const API_URL = "http://localhost:3000";

    loadLeaves();
    loadAuditLogs();

    $("#leaveForm").on("submit", function (event) {

        event.preventDefault();

        let employeeId = $("#employeeId").val();
        let leaveType = $("#leaveType").val();
        let fromDate = $("#fromDate").val();
        let toDate = $("#toDate").val();
        let reason = $("#reason").val();
        let attachment = $("#attachment")[0].files[0];

        $("#dateError").text("");

        if (employeeId === "") {
            alert("Please enter your Employee ID.");
            return;
        }

        if (Number(employeeId) <= 0) {
            alert("Employee ID must be a positive number.");
            return;
        }

        if (leaveType === "") {
            alert("Please select a leave type.");
            return;
        }

        if (fromDate === "" || toDate === "") {
            $("#dateError").text("Please select both From and To dates.");
            return;
        }

        if (toDate < fromDate) {
            $("#dateError").text("To date cannot be before From date.");
            return;
        }

        if (reason.trim() === "") {
            alert("Please enter a reason for leave.");
            return;
        }

        let leave = {
            employeeId: Number(employeeId),
            leaveType: leaveType,
            fromDate: fromDate,
            toDate: toDate,
            reason: reason.trim(),
            attachment: attachment ? attachment.name : "",
            status: "pending",
            managerComment: "",
            createdAt: new Date().toISOString()
        };

        $.ajax({
            url: API_URL + "/leaves",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify(leave),

            success: function () {

                alert("Leave request submitted successfully.");

                $("#leaveForm")[0].reset();

                loadLeaves();

                addAuditLog(
                    "Employee " +
                    employeeId +
                    " applied for " +
                    getLeaveTypeText(leaveType)
                );
            },

            error: function () {
                alert("Unable to submit leave request.");
            }
        });

    });


    function loadLeaves() {

        $.ajax({
            url: API_URL + "/leaves",
            method: "GET",

            success: function (leaves) {

                $("#pendingLeaves").empty();
                $("#approvedLeaves").empty();
                $("#rejectedLeaves").empty();

                let pendingCount = 0;
                let approvedCount = 0;
                let rejectedCount = 0;

                leaves.forEach(function (leave) {

                    if (leave.status === "pending") {
                        $("#pendingLeaves").append(createLeaveCard(leave));
                        pendingCount++;
                    }

                    if (leave.status === "approved") {
                        $("#approvedLeaves").append(createLeaveCard(leave));
                        approvedCount++;
                    }

                    if (leave.status === "rejected") {
                        $("#rejectedLeaves").append(createLeaveCard(leave));
                        rejectedCount++;
                    }
                });

                if (pendingCount === 0) {
                    $("#pendingLeaves").html(
                        '<p class="empty-message">No pending requests</p>'
                    );
                }

                if (approvedCount === 0) {
                    $("#approvedLeaves").html(
                        '<p class="empty-message">No approved requests</p>'
                    );
                }

                if (rejectedCount === 0) {
                    $("#rejectedLeaves").html(
                        '<p class="empty-message">No rejected requests</p>'
                    );
                }
            },

            error: function () {
                alert("Unable to load leave requests.");
            }
        });
    }


    function createLeaveCard(leave) {

        let card = $("<div>").addClass("leave-card");

        let title = $("<h4>")
            .text("Leave Request #" + leave.id);

        let employee = $("<p>")
            .html("<strong>Employee ID:</strong> " + leave.employeeId);

        let type = $("<p>")
            .html(
                "<strong>Leave Type:</strong> " +
                getLeaveTypeText(leave.leaveType)
            );

        let from = $("<p>")
            .html("<strong>From:</strong> " + leave.fromDate);

        let to = $("<p>")
            .html("<strong>To:</strong> " + leave.toDate);

        let reason = $("<p>")
            .html("<strong>Reason:</strong> " + escapeHtml(leave.reason));

        let status = $("<p>")
            .addClass("status")
            .addClass(leave.status)
            .text(capitalize(leave.status));

        card.append(
            title,
            employee,
            type,
            from,
            to,
            reason,
            status
        );

        if (leave.attachment) {

            let attachment = $("<p>")
                .html(
                    "<strong>Attachment:</strong> " +
                    escapeHtml(leave.attachment)
                );

            card.append(attachment);
        }

        if (leave.managerComment) {

            let comment = $("<p>")
                .html(
                    "<strong>Manager Comment:</strong> " +
                    escapeHtml(leave.managerComment)
                );

            card.append(comment);
        }

        if (leave.status === "pending") {

            let actions = $("<div>")
                .addClass("card-actions");

            let approveButton = $("<button>")
                .addClass("approve-btn")
                .attr("data-id", leave.id)
                .text("Approve");

            let rejectButton = $("<button>")
                .addClass("reject-btn")
                .attr("data-id", leave.id)
                .text("Reject");

            actions.append(
                approveButton,
                rejectButton
            );

            card.append(actions);
        }

        return card;
    }


    $(document).on("click", ".approve-btn", function () {

        let id = $(this).attr("data-id");

        let comment = prompt(
            "Enter manager comment:"
        );

        if (comment === null) {
            return;
        }  

        updateLeaveStatus(
            id,
            "approved",
            comment
        );
    });


    $(document).on("click", ".reject-btn", function () {

        let id = $(this).attr("data-id");

        let comment = prompt(
            "Enter manager comment:"
        );

        if (comment === null) {
            return;
        }

        if (comment.trim() === "") {
            alert("Please enter a rejection reason.");
            return;
        }

        updateLeaveStatus(
            id,
            "rejected",
            comment
        );
    });


    function updateLeaveStatus(id, status, comment) {

        $.ajax({
            url: API_URL + "/leaves/" + id,
            method: "GET",

            success: function (leave) {

                if (status === "approved") {

                    checkLeaveBalance(
                        leave.employeeId,
                        leave,
                        comment
                    );

                } else {

                    patchLeaveStatus(
                        leave,
                        status,
                        comment
                    );
                }
            },

            error: function () {
                alert("Unable to find leave request.");
            }
        });
    }


    function checkLeaveBalance(
        employeeId,
        leave,
        comment
    ) {

        $.ajax({
            url: API_URL + "/leaveBalance?employeeId=" + employeeId,
            method: "GET",
            success: function (balances) {
                if (balances.length === 0) {
                    alert("Leave balance not found.");
                    return;
                }
                let balance = balances[0];
                let days = calculateLeaveDays(
                    leave.fromDate,
                    leave.toDate
                );

                let available =
                    leave.leaveType === "sick"
                        ? balance.sick
                        : balance.casual;

                if (days > available) {

                    alert(
                        "Insufficient leave balance."
                    );

                    return;
                }

                patchLeaveStatus(
                    leave,
                    "approved",
                    comment,
                    days,
                    balance
                );
            },

            error: function () {
                alert("Unable to check leave balance.");
            }
        });
    }


    function patchLeaveStatus(leave,status,comment, days = 0, balance = null) {

        $.ajax({
            url: API_URL +
                "/leaves/" +
                leave.id,

            method: "PATCH",

            contentType: "application/json",

            data: JSON.stringify({
                status: status,
                managerComment: comment
            }),

            success: function () {

                if (status === "approved" && balance){
                    updateBalance(
                        balance,
                        leave.leaveType,
                        days,
                        leave
                    );

                } else {

                    loadLeaves();

                    addAuditLog(
                        "Leave Request #" +
                        leave.id +
                        " was " +
                        status
                    );
                }
            },

            error: function () {
                alert(
                    "Unable to update leave request."
                );
            }
        });
    }


    function updateBalance(
        balance,
        leaveType,
        days,
        leave
    ) {

        let newBalance = {};

        if (leaveType === "sick") {

            newBalance.sick =
                balance.sick - days;

            newBalance.casual =
                balance.casual;

        } else {

            newBalance.sick =
                balance.sick;

            newBalance.casual =
                balance.casual - days;
        }

        $.ajax({
            url: API_URL +
                "/leaveBalance/" +
                balance.id,

            method: "PATCH",

            contentType: "application/json",

            data: JSON.stringify(newBalance),

            success: function () {

                loadLeaves();

                addAuditLog(
                    "Leave Request #" +
                    leave.id +
                    " was approved and leave balance updated"
                );
            },

            error: function () {
                alert(
                    "Leave approved but balance update failed."
                );
            }
        });
    }


    $("#checkBalance").on("click", function () {

        let employeeId =
            $("#balanceEmployeeId").val();

        if (employeeId === "") {

            alert(
                "Please enter Employee ID."
            );

            return;
        }

        $.ajax({
            url: API_URL +
                "/leaveBalance?employeeId=" +
                employeeId,

            method: "GET",

            success: function (balances) {

                if (balances.length === 0) {

                    $("#balanceResult").html(
                        '<p class="empty-message">Employee balance not found.</p>'
                    );

                    return;
                }

                let balance = balances[0];

                $("#balanceResult").html(
                    '<div class="balance-card">' +
                        '<div class="balance-item">' +
                            '<h4>Sick Leave</h4>' +
                            '<p>' +
                                balance.sick +
                            '</p>' +
                        '</div>' +
                        '<div class="balance-item">' +
                            '<h4>Casual Leave</h4>' +
                            '<p>' +
                                balance.casual +
                            '</p>' +
                        '</div>' +
                    '</div>'
                );
            },

            error: function () {

                alert(
                    "Unable to load leave balance."
                );
            }
        });
    });


    function addAuditLog(message) {

        let entry = {
            time: new Date().toLocaleTimeString(),
            message: message
        };

        $.ajax({
            url: API_URL + "/auditLogs",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify(entry),

            success: function () {
                loadAuditLogs();
            }
        });
    }


    function loadAuditLogs() {

        $.ajax({
            url: API_URL + "/auditLogs",
            method: "GET",

            success: function (logs) {

                $("#auditLog").empty();

                if (logs.length === 0) {

                    $("#auditLog").html(
                        '<p class="empty-message">No audit records</p>'
                    );

                    return;
                }

                logs.reverse().forEach(function (log) {

                    let entry = $("<div>")
                        .addClass("audit-entry");

                    let time = $("<span>")
                        .addClass("audit-time")
                        .text(log.time);

                    let message = $("<span>")
                        .addClass("audit-message")
                        .text(log.message);

                    entry.append(
                        time,
                        message
                    );

                    $("#auditLog").append(entry);
                });
            }
        });
    }


    function calculateLeaveDays(
        fromDate,
        toDate
    ) {

        let start =
            new Date(fromDate);

        let end =
            new Date(toDate);

        let difference =
            end.getTime() -
            start.getTime();

        return Math.floor(
            difference /
            (1000 * 60 * 60 * 24)
        ) + 1;
    }


    function getLeaveTypeText(type) {

        if (type === "sick") {
            return "Sick Leave";
        }

        if (type === "casual") {
            return "Casual Leave";
        }

        return type;
    }


    function capitalize(value) {

        return value.charAt(0).toUpperCase() +
            value.slice(1);
    }


    function escapeHtml(value) {

        return $("<div>")
            .text(value)
            .html();
    }

});