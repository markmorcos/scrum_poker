/**
 * RoomServiceFacilitatorTest.kt - Tests for board watching and facilitator (host token) logic
 */
package com.scrumpoker.service

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("RoomService Facilitator Tests")
class RoomServiceFacilitatorTest {

    private lateinit var roomService: RoomService

    @BeforeEach
    fun setUp() {
        roomService = RoomService()
    }

    @Test
    @DisplayName("First board becomes facilitator and receives a token")
    fun `first watcher is host`() {
        val result = roomService.watchRoom("happy-panda")

        assertTrue(result.isHost)
        assertNotNull(result.hostToken)
        assertTrue(result.hostToken!!.length >= 20)
        assertNotNull(roomService.getRoomState("happy-panda"))
    }

    @Test
    @DisplayName("Token is issued once; later boards need it to be host")
    fun `token issued once`() {
        val first = roomService.watchRoom("happy-panda")

        val stranger = roomService.watchRoom("happy-panda")
        val returning = roomService.watchRoom("happy-panda", first.hostToken)

        assertFalse(stranger.isHost)
        assertNull(stranger.hostToken)
        assertTrue(returning.isHost)
        assertEquals(first.hostToken, returning.hostToken)
    }

    @Test
    @DisplayName("isHost only accepts the room's token")
    fun `isHost checks token`() {
        val token = roomService.watchRoom("happy-panda").hostToken

        assertTrue(roomService.isHost("happy-panda", token))
        assertFalse(roomService.isHost("happy-panda", "wrong"))
        assertFalse(roomService.isHost("happy-panda", null))
        assertFalse(roomService.isHost("other-room", token))
    }

    @Test
    @DisplayName("A board's stored token is adopted when its room was cleaned up")
    fun `stored token adopted for recreated room`() {
        val result = roomService.watchRoom("happy-panda", "stored-token-123")

        assertTrue(result.isHost)
        assertEquals("stored-token-123", result.hostToken)
    }

    @Test
    @DisplayName("Maintenance cleanup keeps an empty room while a board watches it")
    fun `watched empty room survives cleanup`() {
        roomService.watchRoom("happy-panda")

        roomService.performMaintenanceCleanup()
        assertNotNull(roomService.getRoomState("happy-panda"))

        roomService.unwatchRoom("happy-panda")
        assertNull(roomService.getRoomState("happy-panda"))
    }

    @Test
    @DisplayName("Room stays when the board closes but voters remain")
    fun `room with voters survives unwatch`() {
        roomService.watchRoom("happy-panda")
        roomService.joinRoom("Alice", "happy-panda")

        roomService.unwatchRoom("happy-panda")

        assertEquals(1, roomService.getRoomState("happy-panda")!!.users.size)
    }
}
