import unittest
from unittest.mock import patch
from backend import server

class ServerTest(unittest.TestCase):
    def test_fallback_to_gpt(self):
        with patch.object(server, "gemini", side_effect=RuntimeError("quota")), \
             patch.object(server, "gpt", return_value='{"summary":"Quadro CA visível","items":[{"group":"Proteção","quantity":"1","unit":"un","description":"Quadro DIN","note":"Conferir dimensões"}]}'), \
             patch.object(server, "claude") as claude:
            result = server.analyze_with_fallback("teste", ["imagem"])
        self.assertEqual(result["provider"], "gpt")
        self.assertEqual(result["items"][0]["description"], "Quadro DIN")
        claude.assert_not_called()

    def test_reject_invalid_group(self):
        result = server.parse_answer('{"summary":"x","items":[{"group":"Outro","description":"x"}]}')
        self.assertEqual(result["items"], [])

    def test_reject_bad_photo(self):
        with self.assertRaises(ValueError):
            server.clean_photos(["https://example.com/photo.jpg"])

if __name__ == "__main__":
    unittest.main()
