import socket
import threading

nickname = input("Choose a nickname: ")

client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client.connect(('127.0.0.1', 55555))


def receive():
    while True:
        try:
            message = client.recv(1024).decode('ascii')
            if message == "CHRIS":
                client.send(nickname.encode('ascii'))
            else:
                print(message)
        except:
            print('All Messages Sent!')
            client.close()
            break


def write():
    while True:
        for i in range(0, 100):
            message = f"Message Number {str(int(i) + 1)}\n"
            client.sendall(message.encode('ascii'))
            print(f"Sent: {message.strip()}")
        break
    client.close()


receive_thread = threading.Thread(target=receive)
receive_thread.start()

write_thread = threading.Thread(target=write)
write_thread.start()
