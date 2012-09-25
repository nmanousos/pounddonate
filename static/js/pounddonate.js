/* Default class modification */
$.extend( $.fn.dataTableExt.oStdClasses, {
	"sWrapper": "dataTables_wrapper form-inline"
} );

/* API method to get paging information */
$.fn.dataTableExt.oApi.fnPagingInfo = function ( oSettings )
{
	return {
		"iStart":         oSettings._iDisplayStart,
		"iEnd":           oSettings.fnDisplayEnd(),
		"iLength":        oSettings._iDisplayLength,
		"iTotal":         oSettings.fnRecordsTotal(),
		"iFilteredTotal": oSettings.fnRecordsDisplay(),
		"iPage":          Math.ceil( oSettings._iDisplayStart / oSettings._iDisplayLength ),
		"iTotalPages":    Math.ceil( oSettings.fnRecordsDisplay() / oSettings._iDisplayLength )
	};
}

/* Bootstrap style pagination control */
$.extend( $.fn.dataTableExt.oPagination, {
	"bootstrap": {
		"fnInit": function( oSettings, nPaging, fnDraw ) {
			var oLang = oSettings.oLanguage.oPaginate;
			var fnClickHandler = function ( e ) {
				e.preventDefault();
				if ( oSettings.oApi._fnPageChange(oSettings, e.data.action) ) {
					fnDraw( oSettings );
				}
			};

			$(nPaging).addClass('pagination').append(
				'<ul>'+
					'<li class="prev disabled"><a href="#">&larr; '+oLang.sPrevious+'</a></li>'+
					'<li class="next disabled"><a href="#">'+oLang.sNext+' &rarr; </a></li>'+
				'</ul>'
			);
			var els = $('a', nPaging);
			$(els[0]).bind( 'click.DT', { action: "previous" }, fnClickHandler );
			$(els[1]).bind( 'click.DT', { action: "next" }, fnClickHandler );
		},

		"fnUpdate": function ( oSettings, fnDraw ) {
			var iListLength = 5;
			var oPaging = oSettings.oInstance.fnPagingInfo();
			var an = oSettings.aanFeatures.p;
			var i, j, sClass, iStart, iEnd, iHalf=Math.floor(iListLength/2);

			if ( oPaging.iTotalPages < iListLength) {
				iStart = 1;
				iEnd = oPaging.iTotalPages;
			}
			else if ( oPaging.iPage <= iHalf ) {
				iStart = 1;
				iEnd = iListLength;
			} else if ( oPaging.iPage >= (oPaging.iTotalPages-iHalf) ) {
				iStart = oPaging.iTotalPages - iListLength + 1;
				iEnd = oPaging.iTotalPages;
			} else {
				iStart = oPaging.iPage - iHalf + 1;
				iEnd = iStart + iListLength - 1;
			}

			for ( i=0, iLen=an.length ; i<iLen ; i++ ) {
				// Remove the middle elements
				$('li:gt(0)', an[i]).filter(':not(:last)').remove();

				// Add the new list items and their event handlers
				for ( j=iStart ; j<=iEnd ; j++ ) {
					sClass = (j==oPaging.iPage+1) ? 'class="active"' : '';
					$('<li '+sClass+'><a href="#">'+j+'</a></li>')
						.insertBefore( $('li:last', an[i])[0] )
						.bind('click', function (e) {
							e.preventDefault();
							oSettings._iDisplayStart = (parseInt($('a', this).text(),10)-1) * oPaging.iLength;
							fnDraw( oSettings );
						} );
				}

				// Add / remove disabled classes from the static elements
				if ( oPaging.iPage === 0 ) {
					$('li:first', an[i]).addClass('disabled');
				} else {
					$('li:first', an[i]).removeClass('disabled');
				}

				if ( oPaging.iPage === oPaging.iTotalPages-1 || oPaging.iTotalPages === 0 ) {
					$('li:last', an[i]).addClass('disabled');
				} else {
					$('li:last', an[i]).removeClass('disabled');
				}
			}
		}
	}
} );

function calculateTotalRaised() {
	$(".totalraised").text('0')
	$(".tweet").each(function(index, value){
		$.each( value.innerHTML.split(' '), function( index, value ) {
			if(value.indexOf('$') != -1 ) $(".totalraised").text( (Number($(".totalraised").text()) + Number(value.slice('1'))).toFixed(2) )
		})
	})
}

/* Table initialisation */
$(document).ready(function() {
	$('#payments').dataTable( {
		"sDom": "<'row'<'span4 hidden-phone'l><'span4'f>r>t<'row'<'span4 hidden-phone'i><'span4'p>>",
		"sPaginationType": "bootstrap",
		"aaSorting": [[ 3, "desc" ]],
		"oLanguage": {
			"sLengthMenu": "_MENU_ tweets per page",
			"sEmptyTable": "No donations yet"
		}
	} );

	$('#admin').dataTable( {
		"sDom": "<'row'<'span6 hidden-phone'l><'span6'f>r>t<'row'<'span6 hidden-phone'i><'span6'p>>",
		"sPaginationType": "bootstrap",
		"aaSorting": [[ 3, "desc" ]],
		"oLanguage": {
			"sLengthMenu": "_MENU_ tweets per page",
			"sEmptyTable": "No donations yet"
		}
	} );	
	
	//calculateTotalRaised()
	  
  if( typeof username != 'undefined' ) {
    var socket = io.connect( '/' + username, { 'force new connection' : true } )
    socket.on( 'server_message', function( data ) {
      //console.log ( data )
      
      if( username != 'admin' ) {
      
				var date = data.created_at.split(' ')
				data.created_at = date[0] + ' ' + date[1] + ' ' + date[2] + ' ' + date[5] + ', ' + date[3]      
				
				var ai = $('#payments').dataTable().fnAddData( [
	
					'<a href="http://twitter.com/' + data.user.screen_name + '"><img src="' + data.user.profile_image_url + '"/></a>'+
					'<strong><a href="http://twitter.com/' + data.user.screen_name + '">@'+data.user.screen_name+'</a></strong><br/>'+
					(data.user.screen_name.toLowerCase() === username ? '<i class="icon-minus-sign"></i>' : '<i class="icon-plus-sign"></i>')+
					(data.pounddonate_status === 'Pending' ? '<i class="icon-time"></i>' : '<i class="icon-ok-circle"></i>')+
					'<br style="clear:both;"/><span class="tweet">' + data.text + '</span>'
					
					, data.created_at ] )
				
				var n = $('#payments').dataTable().fnSettings().aoData[ ai[0] ].nTr;
				$('td', n).effect("highlight", {}, 3000);
				//calculateTotalRaised()
				//$("#money")[0].play();
			
			} else {
				$("#stream").prepend('<strong>@'+data.user.screen_name+': '+data.text+'</strong><br/>')
			}
      
    })
    
    socket.on( 'server_message_raw', function( data ) {
	    $("#stream").prepend('@'+data.user.screen_name+': ' + data.text+'<br/>')
    })

    
  }

} );