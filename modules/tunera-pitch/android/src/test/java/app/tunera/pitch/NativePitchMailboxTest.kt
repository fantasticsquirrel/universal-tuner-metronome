package app.tunera.pitch

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.junit.Assert.*
import org.junit.Test

class NativePitchMailboxTest {
  private fun result(timestamp: Long) = NativePitchResult(440.0, 0.99, 0.01, false, timestamp)

  @Test
  fun `stalled consumer retains one wake and only the newest frame`() {
    val mailbox = NativePitchMailbox()
    val session = mailbox.reset()
    var wakes = 0
    repeat(10_000) { index ->
      if (mailbox.publish(session, result(index.toLong()))) wakes++
    }
    assertEquals(1, wakes)
    val taken = mailbox.take(session, 10_025)!!
    assertEquals(result(9_999), taken.result)
    assertEquals(26L, taken.ageMs)
    assertNull(mailbox.take(session, 10_026))
    assertTrue("draining permits exactly one new wake", mailbox.publish(session, result(10_030)))
    assertFalse(mailbox.publish(session, result(10_040)))
  }

  @Test
  fun `reset invalidates frames producers and queued wakes from previous sessions`() {
    val mailbox = NativePitchMailbox()
    val oldSession = mailbox.reset()
    assertTrue(mailbox.publish(oldSession, result(100)))
    val currentSession = mailbox.reset()
    assertFalse(mailbox.isCurrent(oldSession))
    assertTrue(mailbox.isCurrent(currentSession))
    assertNull(mailbox.take(currentSession, 200))
    assertFalse(mailbox.publish(oldSession, result(201)))
    assertTrue(mailbox.publish(currentSession, result(202)))
    assertNull("an old queued wake must not drain a fresh frame", mailbox.take(oldSession, 203))
    assertFalse("an old wake must not reset the current wake flag", mailbox.publish(currentSession, result(204)))
    assertEquals(result(204), mailbox.take(currentSession, 205)!!.result)
  }

  @Test
  fun `age uses monotonic analysis time without turning missing frames into misses`() {
    val mailbox = NativePitchMailbox()
    val session = mailbox.reset()
    assertNull(mailbox.take(session, 5_000))
    val miss = NativePitchResult(null, 0.0, 0.001, false, 4_700)
    mailbox.publish(session, miss)
    assertEquals(NativePitchDelivery(miss, 300), mailbox.take(session, 5_000))
    assertNull(mailbox.take(session, 5_000))
    mailbox.publish(session, result(5_100))
    assertEquals("defensive clamp for a clock supplied before the frame", 0L, mailbox.take(session, 5_000)!!.ageMs)
  }

  @Test
  fun `concurrent publish and drain never lose the final frame or future wake`() {
    val mailbox = NativePitchMailbox()
    val session = mailbox.reset()
    val start = CountDownLatch(1)
    val done = CountDownLatch(1)
    val producer = thread {
      start.await()
      repeat(20_000) { mailbox.publish(session, result(it.toLong())) }
      done.countDown()
    }
    var lastTimestamp = -1L
    start.countDown()
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
    while (done.count > 0 && System.nanoTime() < deadline) {
      mailbox.take(session, 30_000)?.let {
        assertTrue("newest delivery cannot move backwards", it.result.timestamp > lastTimestamp)
        lastTimestamp = it.result.timestamp
      }
      Thread.yield()
    }
    assertTrue(done.await(5, TimeUnit.SECONDS))
    producer.join(5_000)
    mailbox.take(session, 30_000)?.let { lastTimestamp = it.result.timestamp }
    assertEquals(19_999L, lastTimestamp)
    assertNull(mailbox.take(session, 30_000))
    assertTrue(mailbox.publish(session, result(30_001)))
  }

  @Test
  fun `racing a drain with a publish cannot strand a pending result without a wake`() {
    val mailbox = NativePitchMailbox()
    repeat(500) {
      val session = mailbox.reset()
      assertTrue(mailbox.publish(session, result(1)))
      val start = CountDownLatch(1)
      var publishedWake = false
      val producer = thread {
        start.await()
        publishedWake = mailbox.publish(session, result(2))
      }
      start.countDown()
      val first = mailbox.take(session, 3)!!
      producer.join(5_000)
      assertFalse(producer.isAlive)
      if (first.result.timestamp == 1L) {
        assertTrue("publish after drain must request a fresh wake", publishedWake)
        assertEquals(2L, mailbox.take(session, 3)!!.result.timestamp)
      } else {
        assertEquals(2L, first.result.timestamp)
        assertFalse("publish before drain reuses the outstanding wake", publishedWake)
        assertNull(mailbox.take(session, 3))
      }
    }
  }
}
