import frappe

def remind_checkin():
    subject = "Daily Reminder: Check-in at 09:00"
    message = """
    <p>Good Morning Team,</p>
    <p>This is a reminder to complete your <b>check-in at 09:00 AM</b>.</p>
    <p>Thank you.</p>
    """

    users = frappe.get_all(
        "User",
        filters={
            "enabled": 1,
            "user_type": ["!=", "Website User"],
            "name": ["not in", ["Administrator", "Guest"]],
        },
        pluck="email",
    )

    recipients = [u for u in users if u]

    for i in range(0, len(recipients), 50):
        frappe.enqueue(
            method=frappe.sendmail,
            queue="short",
            recipients=recipients[i:i + 50],
            subject=subject,
            message=message,
            now=False,
        )
