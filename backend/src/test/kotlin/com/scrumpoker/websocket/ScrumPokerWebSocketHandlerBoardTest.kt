/**
 * ScrumPokerWebSocketHandlerBoardTest.kt - Board (shared screen) and facilitator flow tests
 *
 * Drives the handler with a real RoomService and recording sessions to verify that boards receive
 * room updates and that reveal/reset are restricted to the facilitator.
 */
package com.scrumpoker.websocket

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.scrumpoker.service.RoomService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage

@DisplayName("ScrumPokerWebSocketHandler Board Tests")
class ScrumPokerWebSocketHandlerBoardTest {

    private val objectMapper = jacksonObjectMapper()
    private lateinit var roomService: RoomService
    private lateinit var handler: ScrumPokerWebSocketHandler

    @BeforeEach
    fun setUp() {
        roomService = RoomService()
        handler = ScrumPokerWebSocketHandler(roomService, objectMapper)
    }

    private fun send(session: RecordingWebSocketSession, type: String, payload: Map<String, Any?>) {
        handler.handleMessage(
                session,
                TextMessage(objectMapper.writeValueAsString(mapOf("type" to type, "payload" to payload)))
        )
    }

    private fun RecordingWebSocketSession.messages(type: String): List<Map<String, Any?>> =
            sent.map { objectMapper.readValue(it, Map::class.java) }
                    .filter { it["type"] == type }
                    .map {
                        @Suppress("UNCHECKED_CAST")
                        it["payload"] as Map<String, Any?>
                    }

    private fun openBoard(): Pair<RecordingWebSocketSession, String> {
        val board = RecordingWebSocketSession("board")
        send(board, "WATCH", mapOf("roomId" to "room"))
        val watch = board.messages("WATCH").single()
        assertEquals(true, watch["isHost"])
        return board to watch["hostToken"] as String
    }

    private fun joinVoter(id: String, name: String, hostToken: String? = null): RecordingWebSocketSession {
        val phone = RecordingWebSocketSession(id)
        send(phone, "JOIN", mapOf("name" to name, "roomId" to "room", "hostToken" to hostToken))
        return phone
    }

    @Test
    @DisplayName("Board receives room updates without appearing as a user")
    fun `board receives updates`() {
        val (board, _) = openBoard()
        val phone = joinVoter("p1", "Alice")
        val userId = phone.messages("JOIN").single()["userId"] as String

        send(phone, "VOTE", mapOf("userId" to userId, "roomId" to "room", "estimate" to "5"))

        val lastUpdate = board.messages("ROOM_UPDATE").last()
        @Suppress("UNCHECKED_CAST") val users = lastUpdate["users"] as List<Map<String, Any?>>
        assertEquals(listOf("Alice"), users.map { it["name"] })
        assertEquals(true, users.single()["hasVoted"])
        assertFalse(objectMapper.writeValueAsString(lastUpdate).contains("hostToken"))
    }

    @Test
    @DisplayName("Reveal without the host token is rejected")
    fun `non host cannot reveal`() {
        openBoard()
        val phone = joinVoter("p1", "Alice")

        send(phone, "SHOW_ESTIMATES", mapOf("roomId" to "room"))
        send(phone, "DELETE_ESTIMATES", mapOf("roomId" to "room", "hostToken" to "guess"))

        assertEquals(2, phone.messages("ERROR").size)
        assertFalse(roomService.getRoomState("room")!!.showEstimates)
        assertEquals(false, phone.messages("JOIN").single()["isHost"])
    }

    @Test
    @DisplayName("Board and facilitator phone can reveal and reset")
    fun `host can reveal`() {
        val (board, token) = openBoard()
        val hostPhone = joinVoter("p1", "Mark", token)
        assertEquals(true, hostPhone.messages("JOIN").single()["isHost"])

        send(hostPhone, "SHOW_ESTIMATES", mapOf("roomId" to "room", "hostToken" to token))
        assertTrue(roomService.getRoomState("room")!!.showEstimates)

        send(board, "DELETE_ESTIMATES", mapOf("roomId" to "room", "hostToken" to token))
        assertFalse(roomService.getRoomState("room")!!.showEstimates)
        assertTrue(board.messages("ERROR").isEmpty())
    }

    @Test
    @DisplayName("Closing the board releases an empty room")
    fun `board close releases room`() {
        val (board, _) = openBoard()

        handler.afterConnectionClosed(board, CloseStatus.NORMAL)

        assertNull(roomService.getRoomState("room"))
    }
}

/** WebSocket session that records every text message sent to it */
class RecordingWebSocketSession(private val sessionId: String) :
        org.springframework.web.socket.WebSocketSession {
    val sent = mutableListOf<String>()
    override fun getId(): String = sessionId
    override fun getUri(): java.net.URI? = null
    override fun getHandshakeHeaders(): org.springframework.http.HttpHeaders =
            org.springframework.http.HttpHeaders()
    override fun getAttributes(): MutableMap<String, Any> = mutableMapOf()
    override fun getPrincipal(): java.security.Principal? = null
    override fun getLocalAddress(): java.net.InetSocketAddress? = null
    override fun getRemoteAddress(): java.net.InetSocketAddress? = null
    override fun getAcceptedProtocol(): String? = null
    override fun getTextMessageSizeLimit(): Int = 0
    override fun setTextMessageSizeLimit(messageSizeLimit: Int) {}
    override fun getBinaryMessageSizeLimit(): Int = 0
    override fun setBinaryMessageSizeLimit(messageSizeLimit: Int) {}
    override fun getExtensions(): MutableList<org.springframework.web.socket.WebSocketExtension> =
            mutableListOf()
    override fun sendMessage(message: org.springframework.web.socket.WebSocketMessage<*>) {
        sent.add(message.payload as String)
    }
    override fun isOpen(): Boolean = true
    override fun close() {}
    override fun close(status: CloseStatus) {}
}
