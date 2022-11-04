export const PORT = parseInt(process.env.PORT) || 5010
export const RX_TIMEOUT_MS = parseInt(process.env.RX_TIMEOUT_MS) || 2000
export const DEBUG = process.env.DEBUG === "true"
const FORWARD = process.env.FORWARD || ""

export const forwards:{hostname: string, port: number}[]= []
FORWARD.split(",").map((f) => {
    const [hostname, port] = f.split(":")
    if(!hostname || !port) return
    forwards.push({hostname, port: parseInt(port)})
})

console.log(`Starting server on port ${PORT}`)
console.log(`Forwarding to`, forwards)

export default {
    PORT,
    RX_TIMEOUT_MS,
    DEBUG,
    forwards
}