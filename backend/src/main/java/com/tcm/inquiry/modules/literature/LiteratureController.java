package com.tcm.inquiry.modules.literature;

import java.io.IOException;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.tcm.inquiry.common.api.ApiResult;
import com.tcm.inquiry.common.api.R;
import com.tcm.inquiry.modules.literature.ai.LiteratureRagService;
import com.tcm.inquiry.modules.literature.dto.req.LiteratureQueryRequest;
import com.tcm.inquiry.modules.literature.dto.resp.LiteratureFileView;
import com.tcm.inquiry.modules.literature.dto.resp.LiteratureQueryResponse;
import com.tcm.inquiry.modules.literature.service.LiteratureIngestionService;
import com.tcm.inquiry.modules.literature.service.LiteratureManageService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/literature")
public class LiteratureController {

    private final LiteratureIngestionService literatureIngestionService;
    private final LiteratureRagService literatureRagService;
    private final LiteratureManageService literatureManageService;

    public LiteratureController(
            LiteratureIngestionService literatureIngestionService,
            LiteratureRagService literatureRagService,
            LiteratureManageService literatureManageService) {
        this.literatureIngestionService = literatureIngestionService;
        this.literatureRagService = literatureRagService;
        this.literatureManageService = literatureManageService;
    }

    @GetMapping("/health")
    public ResponseEntity<ApiResult<String>> health() {
        return ResponseEntity.ok(R.ok("literature"));
    }

    @GetMapping("/uploads")
    public ResponseEntity<ApiResult<List<LiteratureFileView>>> listUploads() {
        return ResponseEntity.ok(R.ok(literatureManageService.listAll()));
    }

    @GetMapping("/collections/{collectionId}/files")
    public ResponseEntity<ApiResult<List<LiteratureFileView>>> listCollectionFiles(
            @PathVariable("collectionId") String collectionId) {
        return ResponseEntity.ok(R.ok(literatureManageService.listCollection(collectionId)));
    }

    @PostMapping(value = "/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResult<LiteratureFileView>> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "collectionId", required = false) String collectionId,
            @RequestParam(value = "chunkSize", required = false) Integer chunkSize,
            @RequestParam(value = "chunkOverlap", required = false) Integer chunkOverlap)
            throws IOException {
        return ResponseEntity.ok(
                R.ok(literatureIngestionService.ingest(collectionId, file, chunkSize, chunkOverlap)));
    }

    @PostMapping("/collections/{collectionId}/query")
    public ResponseEntity<ApiResult<LiteratureQueryResponse>> query(
            @PathVariable("collectionId") String collectionId,
            @Valid @RequestBody LiteratureQueryRequest body) {
        return ResponseEntity.ok(R.ok(literatureRagService.query(collectionId, body)));
    }

    @PostMapping(
            value = "/collections/{collectionId}/query/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter queryStream(
            @PathVariable("collectionId") String collectionId,
            @Valid @RequestBody LiteratureQueryRequest body) {
        return literatureRagService.streamQuery(collectionId, body);
    }

    @DeleteMapping("/collections/{collectionId}")
    public ResponseEntity<ApiResult<Void>> deleteCollection(@PathVariable("collectionId") String collectionId) {
        literatureManageService.deleteCollection(collectionId);
        return ResponseEntity.ok(R.ok(null));
    }

    @DeleteMapping("/collections/{collectionId}/documents/{fileUuid}")
    public ResponseEntity<ApiResult<Void>> deleteDocument(
            @PathVariable("collectionId") String collectionId, @PathVariable String fileUuid) {
        literatureManageService.deleteFile(collectionId, fileUuid);
        return ResponseEntity.ok(R.ok(null));
    }
}
