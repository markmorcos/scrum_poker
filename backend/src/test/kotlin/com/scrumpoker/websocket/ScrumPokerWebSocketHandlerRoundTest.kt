/**
 * ScrumPokerWebSocketHandlerRoundTest.kt - Full voting round through the WebSocket handler
 *
 * Drives the handler with a real RoomService and recording sessions to verify that every
 * participant receives room updates and that any participant can reveal and reset a round.
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

@DisplayName("ScrumPokerWebSocketHandler Round Tests")
class ScrumPokerWebSocketHandlerRoundTest {

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

    private fun join(id: String, name: String): Pair<RecordingWebSocketSession, String> {
        val session = RecordingWebSocketSession(id)
        send(session, "JOIN", mapOf("name" to name, "roomId" to "room"))
        return session to session.messages("JOIN").single()["userId"] as String
    }

    @Test
    @DisplayName("Every participant receives room updates")
    fun `participants receive updates`() {
        val (alice, _) = join("s1", "Alice")
        val (bob, bobId) = join("s2", "Bob")

        send(bob, "VOTE", mapOf("userId" to bobId, "roomId" to "room", "estimate" to "5"))

        for (session in listOf(alice, bob)) {
            @Suppress("UNCHECKED_CAST")
            val users = session.messages("ROOM_UPDATE").last()["users"] as List<Map<String, Any?>>
            assertEquals(listOf("Alice", "Bob"), users.map { it["name"] })
            assertEquals(listOf(false, true), users.map { it["hasVoted"] })
        }
    }

    @Test
    @DisplayName("Any participant can reveal and reset the round")
    fun `anyone can reveal and reset`() {
        val (alice, aliceId) = join("s1", "Alice")
        val (bob, bobId) = join("s2", "Bob")
        send(alice, "VOTE", mapOf("userId" to aliceId, "roomId" to "room", "estimate" to "3"))
        send(bob, "VOTE", mapOf("userId" to bobId, "roomId" to "room", "estimate" to "8"))

        // Bob, who did not create the room, reveals
        send(bob, "SHOW_ESTIMATES", mapOf("roomId" to "room"))
        val revealed = roomService.getRoomState("room")!!
        assertTrue(revealed.showEstimates)
        assertEquals(listOf("3", "8"), revealed.users.map { it.estimate })

        // Alice starts a new round
        send(alice, "DELETE_ESTIMATES", mapOf("roomId" to "room"))
        val reset = roomService.getRoomState("room")!!
        assertFalse(reset.showEstimates)
        assertTrue(reset.users.none { it.hasVoted })

        assertTrue(alice.messages("ERROR").isEmpty())
        assertTrue(bob.messages("ERROR").isEmpty())
    }

    @Test
    @DisplayName("Closing a participant's connection keeps them in the room during the grace period")
    fun `disconnect starts grace period`() {
        val (alice, aliceId) = join("s1", "Alice")
        join("s2", "Bob")

        handler.afterConnectionClosed(alice, CloseStatus.NORMAL)

        assertNotNull(roomService.getUserById(aliceId)?.disconnectedAt)
        assertEquals(listOf("Bob"), roomService.getRoomState("room")!!.users.map { it.name })
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
