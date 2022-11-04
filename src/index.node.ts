import {Socket, createServer} from "net"
import process from "process"
import {
    PORT,
    RX_TIMEOUT_MS,
    forwards
} from "./common"

class TCPSocket extends Socket {
    declare id:string
}

const sockets = new Map<string, {socket: Socket, timeout: NodeJS.Timeout | undefined}>()

const startTimeout = (id:string, socket: Socket) => {
    let timeout
    if(RX_TIMEOUT_MS > 0)
        timeout = setTimeout(() => socket.destroy(), RX_TIMEOUT_MS)
    sockets.set(id, {socket, timeout})
}

const cancelTimeout = (id:string) => {
    const s = sockets.get(id)
    if(s && s.timeout) clearTimeout(s.timeout)
}

const forward = (hostname: string, port: number, data:Buffer, onMessage?:(message:Buffer) => void):Promise<void> => {
    return new Promise((res, rej) => {
        // console.log(`Forwarding to ${hostname}:${port}`)
        const socket = new TCPSocket()
        socket.id = "tx_"+Date.now()+"_"+Math.floor(Math.random()*1000)
        socket.connect(port, hostname, () => {
            console.log(`Connected to ${hostname}:${port}`)
            socket.write(data)
            if(!onMessage)  socket.destroy() // Shut down right away if we don't forward the response back
            else    startTimeout(socket.id, socket)
        })
        socket.on("data", (message) => {
            startTimeout(socket.id, socket)
            console.log(`Received data from ${socket.id}: ${message.toString()}`)
            onMessage && onMessage(message)
            socket.destroy()
        })
        socket.on("close", () => {
            console.log("Closing socket", socket.id);
            cancelTimeout(socket.id)
            res()
        })
    })
}

const server = createServer()
.listen(PORT)
.on("connection", (socket: TCPSocket) => {
    const id = "rx_"+Date.now()+"_"+Math.floor(Math.random()*1000)
    socket.id = id

    socket.on("data", (data:Buffer) => {
        cancelTimeout(socket.id)
        console.log(`Received data from ${socket.id}: ${data.toString()}`)
    
        const promises = forwards.map((f, i) => {
            const onMessage = (message:Buffer) => {
                console.log(`Forwarding data back from ${f.hostname}:${f.port}: ${message.toString()}`)
                socket.write(message)
                socket.destroy()
            }
    
            return forward(f.hostname, f.port, data, !i ? onMessage : undefined)
        })
    
        startTimeout(socket.id, socket)
    })

    socket.on("close", (e) => {
        cancelTimeout(socket.id)
        console.log(`Socket closed ${socket.id}`, e)
    })

    console.log(`Socket opened ${id}`)
    startTimeout(id, socket)
})

server.on('error', (err:Error) => {
    console.log("Error", err.message)
})

function signalHandler() {
    // Clean exit
    process.exit()
}

//@ts-ignore
process.on('SIGINT', signalHandler)
//@ts-ignore
process.on('SIGTERM', signalHandler)
//@ts-ignore
process.on('SIGQUIT', signalHandler)