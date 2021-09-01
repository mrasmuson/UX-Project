import {
    InterfaceText,
    LoadingMessage,
    ProfilePic
} from './Misc';
import React, { useState, useEffect, useRef } from 'react';
import Sefaria  from './sefaria/sefaria';
import { BroadcastChannel } from 'broadcast-channel';

const BeitMidrash = ({socket}) => {
    const beitMidrashId = "tempString";
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    const [activeChatRooms, setActiveChatRooms] = useState([]);
    const [chatDataStore, _setChatDataStore] = useState({});
    const chatDataStoreRef = useRef(chatDataStore);
    const [profile, setProfile] = useState({});
    const [currentChatRoom, setCurrentChatRoom] = useState("");
    const [beitMidrashHome, setBeitMidrashHome] = useState(true);
    const [outgoingCall, setOutgoingCall] = useState(false);
    const [userB, setUserB] = useState({});
    const [socketConnected, setSocketConnected] = useState(false);
    const [socketObj, setSocketObj] = useState(socket);
    const [partnerLeftNotification, setPartnerLeftNotification] = useState(false);
    const chatChannel = new BroadcastChannel('chavruta-chats');

    const setChatDataStore = (data) => {
        console.log("data", data)
        chatDataStoreRef.current = data;
        _setChatDataStore(data);
    }
    
    const addMessageToDataStore = (user, room, message) => {
        const roomExists = chatDataStoreRef.current[room.roomId]
        console.log("chatDataStoreRef.current", chatDataStoreRef.current)
        console.log("roomExists", roomExists)
        setChatDataStore({
            ...chatDataStoreRef.current,
            [room.roomId]: {
                chatMembers: [
                    room.userB,
                    room.user
                ],
                messages: [...(roomExists ? chatDataStoreRef.current[room.roomId].messages : []), {
                senderId: user.uid,
                message: message,
                timestamp: Date.now()
                }]}
            });
    }

    useEffect(() => {
        socketObj.connect();

        socketObj.io.on("reconnect", (attempt) => {
            setSocketConnected(socket);
            console.log(`Reconnected after ${attempt} attempt(s)`);
            socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.organization, beitMidrashId);
        });

        socketObj.on("connectionStarted", () => {setSocketConnected(true)})

        if (Sefaria._uid) {
            Sefaria.profileAPI(Sefaria.slug).then(profile => {
                setProfile(profile)
                socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.organization, beitMidrashId);
            });
        }

        //user B receives connection request
        socketObj.on("connection request", (user) => {
            chavrutaRequestReceived(user)
        })
        //sends rejection to user A
        socketObj.on("send connection rejection", ()=>{
            window.alert("User is not available.");
            setBeitMidrashHome(true)
        })
        //user A gets acceptance alert
        socketObj.on("send room ID to client", (room)=> {
            window.location = `/chavruta?rid=${room}`;
        });

        const onDisconnect = () => {
            socketObj.disconnect();
            setSocketConnected(false);
        }

        window.addEventListener("beforeunload", onDisconnect)

        return () => {
            window.removeEventListener("beforeunload", onDisconnect)
            onDisconnect()
        }
    }, [])

    useEffect(()=> {
        socketObj.on("change in people", function(people, uid) {
            const dedupedPeople = people.filter((person, index,self) => {
                return index === self.findIndex((p) => p.uid === person.uid)
            })
            const filteredDedupedPeople = dedupedPeople.filter(person => person.beitMidrashId === beitMidrashId);
            setPeopleInBeitMidrash(filteredDedupedPeople);

            let roomIdToCheck = uid < Sefaria._uid ? `${uid}-${Sefaria._uid}`: `${Sefaria._uid}-${uid}`;
            console.log("roomIdToCheck", roomIdToCheck)
            console.log("currentChatRoom", currentChatRoom)
            if (currentChatRoom === roomIdToCheck) {
                setPartnerLeftNotification(false)
            }
        })
    }, [currentChatRoom])

    useEffect(()=>{
       socketObj.off("received chat message")

       socketObj.on("received chat message", (msgSender, message, room) => {
            room.userB = msgSender;
            room.user = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization};

            addMessageToDataStore(msgSender, room, message);
            const currentActiveChatRoomIds = activeChatRooms.map(r => {return r.roomId});
            console.log(currentActiveChatRoomIds);
            if (!currentActiveChatRoomIds.includes(room.roomId)) {
                setActiveChatRooms([room]);
                socketObj.emit("join chat room", room);
            };

            setCurrentChatRoom(room.roomId)
            console.log("activeChatRooms", activeChatRooms)
        })


    }, [activeChatRooms])

    useEffect(()=>{
        chatChannel.onmessage = (msg) => {
            const currentActiveChatRoomIds = activeChatRooms.map(r => {return r.roomId});
            console.log(currentActiveChatRoomIds)
            if (!currentActiveChatRoomIds.includes(msg.room.roomId)) {
                setActiveChatRooms([msg.room]);
                socketObj.emit("join chat room", msg.room);
            };
            setCurrentChatRoom(msg.room.roomId)

            console.log("msg", msg)
            console.log("adding message to data store, ", msg.msgSender, msg.room, msg.chatMessage)
            addMessageToDataStore(msg.msgSender, msg.room, msg.chatMessage)
        }
    }, [])

    const pairsLearning = (people) => {
        //create an array of roomIds
        const rooms = people.map(user => user.roomId);
        //initialize empty object for pairs
        const pairs = {};
        //loop through the rooms, find matching users for each room, push into pairs object
        rooms.forEach(room => {
            if (room) {
                pairs[room] = people.filter(user => room === user.roomId);
            }
        })
        return Object.values(pairs);
    }

    const startChat = (user) => {
        let roomId = user.uid < Sefaria._uid ? `${user.uid}-${Sefaria._uid}`: `${Sefaria._uid}-${user.uid}` 
      
        const room = {roomId, userB: user, user: {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}};

        const currentActiveChatRoomIds = activeChatRooms.map(room => {return room.roomId})
        if (!currentActiveChatRoomIds.includes(roomId)) {
            setActiveChatRooms([room]);
        }
        setCurrentChatRoom(roomId)

        if (!chatDataStore[roomId]) {
            setChatDataStore({...chatDataStore,
                [roomId]: {
                    chatMembers: [
                        user,
                        {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}
                    ],
                    messages: []
                }});
        }
    }

    const handleCloseChat = (roomObj) => {
        setActiveChatRooms(activeChatRooms.filter(room => room.roomId !== roomObj.roomId));
    }

    const chavrutaCallInitiated = (uid) => {
        console.log('connect with other user', uid)
        setBeitMidrashHome(false)
        setOutgoingCall(true)
    }

    const chavrutaRequestReceived = (user) => {
        setUserB(user)
        setBeitMidrashHome(false)
        setOutgoingCall(false)
    }

    return (
        socketConnected ?
        <div id="beitMidrashContainer">
            { beitMidrashHome ?
            <BeitMidrashHome
                beitMidrashId = {beitMidrashId}
                peopleInBeitMidrash={peopleInBeitMidrash}
                activeChatRooms={activeChatRooms}
                currentChatRoom={currentChatRoom}
                startChat={startChat}
                chatDataStore={chatDataStore}
                setChatDataStore={setChatDataStore}
                chatDataStoreRef={chatDataStoreRef}
                handleCloseChat={handleCloseChat}
                chavrutaCallInitiated={chavrutaCallInitiated}
                chavrutaRequestReceived={chavrutaRequestReceived}
                setUserB={setUserB}
                socket={socketObj}
                profile={profile}
                partnerLeftNotification={partnerLeftNotification}
                setPartnerLeftNotification={setPartnerLeftNotification}
            /> :
            <ChavrutaCall
                outgoingCall={outgoingCall}
                userB={userB}
                setBeitMidrashHome={setBeitMidrashHome}
                socket={socketObj}
            />}
        </div> : <LoadingMessage/>
    )
}

const BeitMidrashHome = ({beitMidrashId,
                        peopleInBeitMidrash,
                        activeChatRooms,
                        currentChatRoom,
                        startChat,
                        chatDataStore,
                        setChatDataStore,
                        chatDataStoreRef,
                        handleCloseChat,
                        chavrutaCallInitiated,
                        chavrutaRequestReceived,
                        setUserB,
                        socket,
                        profile,
                        partnerLeftNotification,
                        setPartnerLeftNotification,
                        }) => {

    return (<div>
        <div>
        <div id="beitMidrashHeader">Chavruta {beitMidrashId}</div>
        <div id="newCall"><a href="/chavruta"><img src="/static/img/camera_with_plus.svg" id="newCallImg" /><span>New Call</span></a></div>
        <hr className="beitMidrashHR" />
            <div className="peopleInBeitMidrash">
                {peopleInBeitMidrash && peopleInBeitMidrash.length > 1 ? peopleInBeitMidrash
                .filter(user => !user.roomId)
                .map(user => {
                    if (user.uid !== Sefaria._uid) {
                    return <div id="beitMidrashUser" key={user.uid} onClick={() => startChat(user)}>
                        <ProfilePic len={42.67} url={user.pic} name={user.name} id="beitMidrashProfilePic" />
                        <div id ="beitMidrashUserText">
                        {user.name}
                        {/* {currentActiveChatUsers.includes(user.uid) ? null : <button onClick={() => startChat(user)}>Chat</button>
                        } */}
                        <div id="beitMidrashOrg">{user.organization}</div>
                        </div>
                    </div>
                    } else {
                        return null
                    }
                }) : <div className="noUsers">No users online.</div>}
            </div>
            {/* <div>
            {peopleInBeitMidrash ? pairsLearning(peopleInBeitMidrash).map((pair, i)  => <li key={i}>{pair.map(user => user.name).join(", ")}</li>) : null}
            </div> */}
        </div>
        <div>
        <hr className="beitMidrashHR" />
        {activeChatRooms.map(room => {
            if (room.roomId === currentChatRoom) {
                return <ChatBox
                            key={room.roomId}
                            room={room}
                            chatDataStore={chatDataStore}
                            setChatDataStore={setChatDataStore}
                            chatDataStoreRef={chatDataStoreRef}
                            handleCloseChat={handleCloseChat}
                            chavrutaCallInitiated={chavrutaCallInitiated}
                            chavrutaRequestReceived={chavrutaRequestReceived}
                            setUserB={setUserB}
                            socket={socket}
                            profile={profile}
                            partnerLeftNotification={partnerLeftNotification}
                            setPartnerLeftNotification={setPartnerLeftNotification}
                        />
            }
        })}
        </div>
    </div>)
}

const ChavrutaCall = ({outgoingCall, userB, setBeitMidrashHome, socket}) => {
    const handleCallAccepted = (name) => {
        const room = Math.random().toString(36).substring(7);
        socket.emit("send room ID to server", name, room);
        window.location = `/chavruta?rid=${room}`;
    }

    const handleCallDeclined = (name) => {
        socket.emit("connection rejected", name);
        setBeitMidrashHome(true);
    }

    const endCall = (name) => {
        socket.emit("connection rejected", name);
        setBeitMidrashHome(true);
    }

    return (
        outgoingCall ? 
        <div className="callContainer">
            <div>
                <ProfilePic len={300} url={userB.pic} name={userB.name} />
                <div id="endCallButtonHolder">
                    <span id="endCallIcon"><span id="endCall" className="endCallButton" onClick={()=>endCall(userB.name)}></span></span>
                </div>
                <div className = "callText">Calling {userB.name}...</div>
            </div>
            <audio autoPlay loop src="/static/files/chavruta-ringtone.wav" />
            <div className="chavrutaFooter">Questions? Email <a href="mailto:hello@sefaria.org">hello@sefaria.org</a></div>
        </div> : 
        <div className="callContainer">
            <div>
                <ProfilePic len={300} url={userB.pic} name={userB.name} />
                <div className = "callText">Receiving call from {userB.name}...</div>
                <div id="incomingCallButtonHolder">
                    <button id="acceptButton" onClick={()=> handleCallAccepted(userB.name)}>Accept</button>
                    <button id="declineButton" onClick={()=> handleCallDeclined(userB.name)}>Decline</button>
                </div>
            </div>
            <audio autoPlay loop src="/static/files/chavruta-ringtone.wav" />
            <div className="chavrutaFooter">Questions? Email <a href="mailto:hello@sefaria.org">hello@sefaria.org</a></div>
        </div>
    )
}

const ChatBox = ({room,
                chatDataStore,
                setChatDataStore, 
                chatDataStoreRef,
                handleCloseChat,
                chavrutaCallInitiated,
                chavrutaRequestReceived,
                setUserB,
                socket,
                profile,
                partnerLeftNotification,
                setPartnerLeftNotification,
                 }) => {
                   
    const [chatMessage, setChatMessage] = useState("");
    const roomId = room.roomId;
    const chatBox = useRef();

    useEffect(()=>{
        setUserB(room.userB);

        socket.on("leaving chat room", ()=>{
            setPartnerLeftNotification(true);
        })
    }, []);

    useEffect(()=>{
        const lastMessage = chatBox.current.querySelector(".chatMessage:last-of-type")
        if (lastMessage) {
            lastMessage.scrollIntoView()
        }

    }, [chatDataStore, partnerLeftNotification])

    const handleChange = (e) =>{
        setChatMessage(e.target.value);
    }
    
    const handleSubmit = (e) => {
        e.preventDefault();
        
        socket.emit("send chat message", room, chatMessage);
        
        const roomId = room.roomId;
      
        const chatChannel = new BroadcastChannel('chavruta-chats');
        const msgSender = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}
        console.log("chatMessage", chatMessage)
        
        chatChannel.postMessage({msgSender, room, chatMessage})
        
        // We thought we needed this to add to chatdatastore on submit, but the broadcast api appears to add it anyway
        // even though we think it's not supposed to!
        // So for the moment we will comment this out, but 
        // TODO: ensure this doesn't need to be added back in
        //
        // setChatDataStore({...chatDataStoreRef.current, [roomId]: {...chatDataStoreRef.current[roomId], 
        //        messages: [...chatDataStoreRef.current[roomId].messages, {
        //         senderId: Sefaria._uid,
        //         message: chatMessage,
        //         timestamp: Date.now()
        //     }]}
        //    });
        
        e.target.reset();
        setChatMessage("")
    }

    const handleStartCall = (uid) => {
        socket.emit("connect with other user", uid, {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url});
        chavrutaCallInitiated(uid)
    }

 
    return (
    <div className="chat" ref={chatBox}>
        <div id="hideButtonHolder">
            <div id="hideButton" onClick={()=>handleCloseChat(room)}>Hide{" "}<img src="/static/img/downward_carrot.svg" /></div>
        </div>
        <div className="chatBoxHeader">
            <div id="chatUser">
                <ProfilePic len={42.67} url={room.userB.pic} name={room.userB.name} />
                <div className="chatBoxName">{room.userB.name}</div>
            </div>
            {partnerLeftNotification ? null :
            <img 
                onClick={()=>handleStartCall(room["userB"]["uid"])}
                id="greenCameraButton"
                src="/static/img/green_camera.svg" 
                alt="icon of green video camera"
                role="button"
                tabIndex="0"
                aria-roledescription={`click to open a video call with ${room.userB.name}`}
                />
            }
        </div>
        <div className="chats-container">
            {chatDataStore[roomId] ? chatDataStore[roomId].messages.map((message, i) => {
                return (
                    message.senderId === Sefaria._uid ? 
                        <Message user={room.user} key={i} message={message} /> :
                        <Message user={room.userB} key={i} message={message} />
                )
            }) : <LoadingMessage /> }
            {partnerLeftNotification ? <div className="chatMessage">{room.userB.name} has left the chat.</div> : null}
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
            <input type="text" 
                autoFocus  
                disabled={partnerLeftNotification ? true : false}  
                className="chat-input" onChange={handleChange} 
                placeholder="Send a Message"
                dir={Sefaria.hebrew.isHebrew(chatMessage) ? "rtl" : "ltr"}></input>
            <input type="submit" 
            className={chatMessage? "chat-submit chat-submit-blue" : "chat-submit"} 
            disabled={!chatMessage}
            value=""/>
        </form>
    </div>
    )
}

const Message = ({user, message}) => {

    const parsedTimeStamp = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit' })

    return (
        <div className="chatMessage">
                <ProfilePic len={35} url={user.pic} name={user.name} />
            <div className = "chatText">
                <div className="chatNameAndTime"><span>{user.name}</span>{"  "}<span>{parsedTimeStamp}</span></div>
                <div dir={Sefaria.hebrew.isHebrew(message.message) ? "rtl" : "ltr"}>{message.message}</div> 
            </div>
        </div>
    )
}


export default BeitMidrash;