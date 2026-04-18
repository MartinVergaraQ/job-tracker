import nodemailer from 'nodemailer'

type SendEmailParams = {
    to: string
    subject: string
    text: string
    html?: string
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
    if (transporter) return transporter

    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 465)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const secure = process.env.SMTP_SECURE !== 'false'

    if (!host || !user || !pass) {
        throw new Error('Missing SMTP configuration')
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
    })

    return transporter
}

export async function sendEmailNotification({
    to,
    subject,
    text,
    html,
}: SendEmailParams) {
    const from = process.env.EMAIL_FROM

    if (!from) {
        throw new Error('Missing EMAIL_FROM')
    }

    const tx = getTransporter()

    const result = await tx.sendMail({
        from,
        to,
        subject,
        text,
        html,
    })

    return result
}